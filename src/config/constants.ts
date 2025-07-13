import { PublicKey } from '@solana/web3.js';

export const DEFAULT_CONFIG = {
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899',
  //solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  maxGasPrice: 1000000000, // 1 SOL
  minGasPrice: 5000000,    // 0.005 SOL
  maxRetries: 3,
  retryDelay: 1000,        // 1 second
  port: 3000,
  host: '0.0.0.0',
  corsOrigins: ['*'],
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }
};

export const PRIVACY_CONFIG = {
  maxDelay: 30000,  // 30 seconds
  minDelay: 5000,   // 5 seconds
  mixingEnabled: true,
  maxPoolSize: 10,  // Maximum number of transactions in the mixing pool
  mixingInterval: 60000,  // Process mixing pool every minute
  maxBatchSize: 5,  // Maximum number of transactions to process in one batch
  addDummyTransactions: true,
  maxDummyTransactions: 3  // Maximum number of dummy transactions to add per batch
};

export const ERROR_MESSAGES = {
  INVALID_PROOF: 'Invalid zero-knowledge proof',
  INSUFFICIENT_GAS: 'Insufficient gas for transaction',
  TRANSACTION_FAILED: 'Transaction failed to confirm',
  INVALID_COMMITMENT: 'Invalid commitment format',
  DUPLICATE_NULLIFIER: 'Nullifier already used',
  NETWORK_ERROR: 'Network error occurred',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded'
};

export const SUCCESS_MESSAGES = {
  TRANSACTION_SUBMITTED: 'Transaction submitted successfully',
  TRANSACTION_CONFIRMED: 'Transaction confirmed',
  PROOF_VERIFIED: 'Proof verified successfully'
};

export const PROGRAM_IDS = {
  CIPHERPAY_PROGRAM: new PublicKey(process.env.CIPHERPAY_PROGRAM_ID || 'XeEs3gHZGdDhs3Lm1VoukrWrEnjdC3CA5VRtowN5MGz'),
  RELAYER_PROGRAM: new PublicKey(process.env.RELAYER_PROGRAM_ID || 'XeEs3gHZGdDhs3Lm1VoukrWrEnjdC3CA5VRtowN5MGz')
};
