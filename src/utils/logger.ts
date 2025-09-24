import pino from 'pino';
import { loadEnv } from '@/services/config/env.js';

const env = loadEnv();

// Create the base logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// Create child loggers for different components
export const logger = {
  // Main application logger
  app: baseLogger.child({ component: 'app' }),
  
  // API request/response logger
  api: baseLogger.child({ component: 'api' }),
  
  // Database operations logger
  db: baseLogger.child({ component: 'database' }),
  
  // Solana operations logger
  solana: baseLogger.child({ component: 'solana' }),
  
  // Merkle tree operations logger
  merkle: baseLogger.child({ component: 'merkle' }),
  
  // Proof verification logger
  proof: baseLogger.child({ component: 'proof' }),
  
  // Authentication logger
  auth: baseLogger.child({ component: 'auth' }),
  
  // Error logger
  error: baseLogger.child({ component: 'error' }),
  
  // Performance logger
  perf: baseLogger.child({ component: 'performance' }),
};

// Log levels
export const LogLevel = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// Log context interface
export interface LogContext {
  requestId?: string;
  userId?: string;
  transactionId?: string;
  operation?: string;
  duration?: number;
  [key: string]: any;
}

// Enhanced logging functions with context
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  // Create a child logger with additional context
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  // Log methods
  trace(message: string, data?: any): void {
    logger.app.trace({ ...this.context, ...data }, message);
  }

  debug(message: string, data?: any): void {
    logger.app.debug({ ...this.context, ...data }, message);
  }

  info(message: string, data?: any): void {
    logger.app.info({ ...this.context, ...data }, message);
  }

  warn(message: string, data?: any): void {
    logger.app.warn({ ...this.context, ...data }, message);
  }

  error(message: string, error?: Error, data?: any): void {
    logger.error.error({ ...this.context, ...data, err: error }, message);
  }

  fatal(message: string, error?: Error, data?: any): void {
    logger.error.fatal({ ...this.context, ...data, err: error }, message);
  }

  // Performance logging
  performance(operation: string, duration: number, data?: any): void {
    logger.perf.info({ ...this.context, operation, duration, ...data }, `Performance: ${operation}`);
  }

  // API request logging
  apiRequest(method: string, url: string, data?: any): void {
    logger.api.info({ ...this.context, method, url, ...data }, `API Request: ${method} ${url}`);
  }

  // API response logging
  apiResponse(method: string, url: string, statusCode: number, duration: number, data?: any): void {
    logger.api.info({ 
      ...this.context, 
      method, 
      url, 
      statusCode, 
      duration, 
      ...data 
    }, `API Response: ${method} ${url} ${statusCode}`);
  }

  // Database operation logging
  dbQuery(query: string, duration: number, data?: any): void {
    logger.db.debug({ ...this.context, query, duration, ...data }, `DB Query executed`);
  }

  // Solana transaction logging
  solanaTx(operation: string, signature: string, duration: number, data?: any): void {
    logger.solana.info({ 
      ...this.context, 
      operation, 
      signature, 
      duration, 
      ...data 
    }, `Solana ${operation}: ${signature}`);
  }

  // Merkle tree operation logging
  merkleOp(operation: string, data?: any): void {
    logger.merkle.debug({ ...this.context, operation, ...data }, `Merkle ${operation}`);
  }

  // Proof verification logging
  proofVerify(circuit: string, success: boolean, duration: number, data?: any): void {
    logger.proof.info({ 
      ...this.context, 
      circuit, 
      success, 
      duration, 
      ...data 
    }, `Proof verification: ${circuit} ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  // Authentication logging
  authEvent(event: string, success: boolean, data?: any): void {
    logger.auth.info({ 
      ...this.context, 
      event, 
      success, 
      ...data 
    }, `Auth ${event}: ${success ? 'SUCCESS' : 'FAILED'}`);
  }
}

// Create a default logger instance
export const defaultLogger = new Logger();

// Utility function to create a logger with request context
export function createRequestLogger(requestId: string, userId?: string): Logger {
  return new Logger({ requestId, userId });
}

// Utility function to create a logger with transaction context
export function createTransactionLogger(transactionId: string, operation: string): Logger {
  return new Logger({ transactionId, operation });
}

// Performance measurement decorator
export function measurePerformance<T extends any[], R>(
  operation: string,
  logger: Logger = defaultLogger
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: T): Promise<R> {
      const start = Date.now();
      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - start;
        logger.performance(operation, duration, { method: propertyName });
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        logger.error(`Performance measurement failed for ${operation}`, error as Error, { 
          method: propertyName, 
          duration 
        });
        throw error;
      }
    };
  };
}

// Async performance measurement function
export async function measureAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  logger: Logger = defaultLogger
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.performance(operation, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`Async operation failed: ${operation}`, error as Error, { duration });
    throw error;
  }
}

// Sync performance measurement function
export function measureSync<T>(
  operation: string,
  fn: () => T,
  logger: Logger = defaultLogger
): T {
  const start = Date.now();
  try {
    const result = fn();
    const duration = Date.now() - start;
    logger.performance(operation, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`Sync operation failed: ${operation}`, error as Error, { duration });
    throw error;
  }
}

export default logger;
