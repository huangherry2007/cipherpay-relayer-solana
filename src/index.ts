import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as bs58 from 'bs58';
import * as dotenv from 'dotenv';
import winston from 'winston';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

import { Relayer } from './core/relayer';
import { TransactionManager, TransactionRequest } from './core/transaction';
import { ProofVerifierFactory, ZKProof } from './core/proof';
import { DEFAULT_CONFIG, PROGRAM_IDS, ERROR_MESSAGES } from './config/constants';
import { validateTransaction } from './utils/validation';
import { UserService } from './auth/userService';
import { AuthMiddleware } from './auth/middleware';
import { AuthRoutes } from './auth/routes';
import { Permission } from './auth/types';

// Load environment variables
dotenv.config();

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'cipherpay-relayer-solana' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize Express app
const app = express();
const port = process.env.PORT || DEFAULT_CONFIG.port;

// Middleware
app.use(helmet());
app.use(cors({
  origin: DEFAULT_CONFIG.corsOrigins,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  }
});

// Slow down repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes, then...
  delayMs: 500 // begin adding 500ms of delay per request above 50
});

app.use(limiter);
app.use(speedLimiter);

// Initialize Solana connection and services
const connection = new Connection(DEFAULT_CONFIG.solanaRpcUrl);
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.RELAYER_PRIVATE_KEY || ''));
const programId = PROGRAM_IDS.CIPHERPAY_PROGRAM;

const relayer = new Relayer({
  solanaRpcUrl: DEFAULT_CONFIG.solanaRpcUrl,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || '',
  programId: programId,
  maxGasPrice: DEFAULT_CONFIG.maxGasPrice,
  minGasPrice: DEFAULT_CONFIG.minGasPrice,
  maxRetries: DEFAULT_CONFIG.maxRetries,
  retryDelay: DEFAULT_CONFIG.retryDelay
});

const transactionManager = new TransactionManager(connection, keypair, programId);

// Initialize user service and authentication middleware
const userService = new UserService({
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  jwtExpiresIn: '24h',
  bcryptRounds: 12,
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
});

const authMiddleware = new AuthMiddleware(userService);
const authRoutes = new AuthRoutes(userService, authMiddleware);

// Export services for testing
export { userService, authMiddleware };

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'cipherpay-relayer-solana',
    version: '0.1.0'
  });
});

// Authentication routes
app.use('/api/v1/auth', authRoutes.getRouter());

// Protected API routes
app.use('/api/v1', authMiddleware.authenticate);

// Submit transaction endpoint
app.post('/api/v1/submit-transaction', 
  authMiddleware.requirePermission(Permission.SUBMIT_TRANSACTION),
  async (req, res) => {
    try {
      const { transactionData, proof, circuitType } = req.body;

      // Validate request
      if (!transactionData || !proof || !circuitType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: transactionData, proof, circuitType'
        });
      }

      // Verify proof first
      const proofValid = await ProofVerifierFactory.verifyProof(circuitType, proof);
      if (!proofValid) {
        return res.status(400).json({
          success: false,
          error: ERROR_MESSAGES.INVALID_PROOF
        });
      }

      // Submit transaction
      const result = await relayer.submitTransaction(transactionData, proof, circuitType);

      res.json({
        success: true,
        transactionId: result.transactionId,
        status: result.status,
        estimatedFee: result.estimatedFee
      });

    } catch (error) {
      logger.error('Error submitting transaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: ERROR_MESSAGES.TRANSACTION_FAILED
      });
    }
  }
);

// Get transaction status endpoint
app.get('/api/v1/transaction/:transactionId', 
  authMiddleware.requirePermission(Permission.VIEW_TRANSACTIONS),
  async (req, res) => {
    try {
      const { transactionId } = req.params;
      const status = await transactionManager.getTransactionStatus(transactionId);

      res.json({
        success: true,
        transactionId,
        status
      });

    } catch (error) {
      logger.error('Error getting transaction status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transactionId: req.params.transactionId,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get transaction status'
      });
    }
  }
);

// Cancel transaction endpoint
app.post('/api/v1/transaction/:transactionId/cancel', 
  authMiddleware.requirePermission(Permission.CANCEL_TRANSACTION),
  async (req, res) => {
    try {
      const { transactionId } = req.params;
      const result = await transactionManager.cancelTransaction(transactionId);

      res.json({
        success: true,
        transactionId,
        status: result.status
      });

    } catch (error) {
      logger.error('Error canceling transaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transactionId: req.params.transactionId,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: 'Failed to cancel transaction'
      });
    }
  }
);

// Estimate fees endpoint
app.post('/api/v1/estimate-fees', 
  authMiddleware.requirePermission(Permission.VIEW_FEES),
  async (req, res) => {
    try {
      const { transactionData, circuitType } = req.body;

      if (!transactionData || !circuitType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: transactionData, circuitType'
        });
      }

      const fees = await transactionManager.estimateFees(transactionData, circuitType);

      res.json({
        success: true,
        estimatedFees: fees
      });

    } catch (error) {
      logger.error('Error estimating fees', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: 'Failed to estimate fees'
      });
    }
  }
);

// Verify proof endpoint
app.post('/api/v1/verify-proof', 
  authMiddleware.requirePermission(Permission.VERIFY_PROOF),
  async (req, res) => {
    try {
      const { circuitType, proof } = req.body;

      // Validate request
      if (!circuitType || !proof) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: circuitType, proof'
        });
      }

      // Verify proof with detailed timing information
      const result = await ProofVerifierFactory.verifyProofWithDetails(circuitType, proof);

      res.json({
        success: true,
        isValid: result.isValid,
        verificationTime: result.verificationTime,
        circuitType,
        error: result.error
      });

    } catch (error) {
      logger.error('Error verifying proof', {
        error: error instanceof Error ? error.message : 'Unknown error',
        circuitType: req.body.circuitType,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({
        success: false,
        error: ERROR_MESSAGES.INVALID_PROOF
      });
    }
  }
);

// Get supported circuits endpoint
app.get('/api/v1/circuits', 
  authMiddleware.requirePermission(Permission.VIEW_CIRCUITS),
  (req, res) => {
    const circuits = [
      { name: 'transfer', description: 'Private transfer circuit' },
      { name: 'merkle', description: 'Merkle tree membership circuit' },
      { name: 'nullifier', description: 'Nullifier circuit' },
      { name: 'stream', description: 'ZK Stream circuit' },
      { name: 'split', description: 'ZK Split circuit' },
      { name: 'condition', description: 'ZK Condition circuit' },
      { name: 'audit', description: 'Audit proof circuit' },
      { name: 'withdraw', description: 'Withdraw circuit' }
    ];

    res.json({
      success: true,
      circuits
    });
  }
);

// System status endpoint
app.get('/api/v1/system/status', 
  authMiddleware.requirePermission(Permission.VIEW_SYSTEM_STATUS),
  (req, res) => {
    const status = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      status
    });
  }
);

// Admin-only endpoints
app.get('/api/v1/admin/logs', 
  authMiddleware.requirePermission(Permission.VIEW_LOGS),
  (req, res) => {
    // In a real implementation, you would return actual logs
    res.json({
      success: true,
      logs: [],
      message: 'Log retrieval not implemented yet'
    });
  }
);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(port, () => {
  logger.info(`CipherPay Solana Relayer started on port ${port}`, {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app; 