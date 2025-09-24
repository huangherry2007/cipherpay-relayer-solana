import { Request, Response, NextFunction } from 'express';
import { logger, createRequestLogger } from '@/utils/logger.js';
import { appMetrics } from '@/monitoring/metrics.js';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      logger: ReturnType<typeof createRequestLogger>;
    }
  }
}

// Request logging middleware
export function requestLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate request ID
    req.requestId = uuidv4();
    req.startTime = Date.now();
    
    // Create request-specific logger
    req.logger = createRequestLogger(req.requestId);
    
    // Log incoming request
    req.logger.apiRequest(req.method, req.path, {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      headers: {
        'content-type': req.get('Content-Type'),
        'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      },
    });

    // Increment request counter
    appMetrics.httpRequestsTotal(req.method, req.path, 0).inc();

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = Date.now() - req.startTime;
      
      // Log response
      req.logger.apiResponse(req.method, req.path, res.statusCode, duration, {
        contentLength: res.get('Content-Length'),
        responseTime: duration,
      });

      // Update metrics
      appMetrics.httpRequestsTotal(req.method, req.path, res.statusCode).inc();
      appMetrics.httpRequestDuration(req.method, req.path).observe(duration);

      // Call original end
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

// Error logging middleware
export function errorLoggingMiddleware() {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    const duration = Date.now() - (req.startTime || Date.now());
    
    // Log error with request context
    const requestLogger = req.logger || createRequestLogger(req.requestId || 'unknown');
    requestLogger.error('Request error', error, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      body: req.body,
      query: req.query,
      params: req.params,
      stack: error.stack,
    });

    // Increment error counter
    appMetrics.httpRequestsTotal(req.method, req.path, res.statusCode || 500).inc();

    next(error);
  };
}

// Database query logging middleware
export function dbQueryLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // This would be used with a database query interceptor
    // For now, we'll just pass through
    next();
  };
}

// Solana transaction logging middleware
export function solanaTransactionLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // This would be used to log Solana transactions
    // For now, we'll just pass through
    next();
  };
}

// Security logging middleware
export function securityLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Log security-relevant events
    const securityLogger = createRequestLogger(req.requestId || 'security');
    
    // Log authentication attempts
    if (req.path.includes('/auth') || req.path.includes('/login')) {
      securityLogger.authEvent('authentication_attempt', true, {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }

    // Log admin operations
    if (req.path.includes('/admin')) {
      securityLogger.authEvent('admin_operation', true, {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
    }

    // Log suspicious patterns
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i,  // XSS attempts
      /union.*select/i,  // SQL injection
      /javascript:/i,  // JavaScript injection
    ];

    const url = req.url.toLowerCase();
    const body = JSON.stringify(req.body || {}).toLowerCase();
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url) || pattern.test(body)) {
        securityLogger.warn('Suspicious request detected', {
          pattern: pattern.toString(),
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        break;
      }
    }

    next();
  };
}

// Performance logging middleware
export function performanceLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = process.hrtime.bigint();
    
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      const requestLogger = req.logger || createRequestLogger(req.requestId || 'unknown');
      requestLogger.performance(`${req.method} ${req.path}`, duration, {
        statusCode: res.statusCode,
        contentLength: res.get('Content-Length'),
      });
    });

    next();
  };
}

// Rate limiting logging middleware
export function rateLimitLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // This would integrate with rate limiting middleware
    // For now, we'll just pass through
    next();
  };
}

// Audit logging middleware
export function auditLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Log important business events
    const auditLogger = createRequestLogger(req.requestId || 'audit');
    
    // Log deposit operations
    if (req.path.includes('/deposit') && req.method === 'POST') {
      auditLogger.info('Deposit operation initiated', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        body: req.body,
      });
    }

    // Log transfer operations
    if (req.path.includes('/transfer') && req.method === 'POST') {
      auditLogger.info('Transfer operation initiated', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        body: req.body,
      });
    }

    // Log withdraw operations
    if (req.path.includes('/withdraw') && req.method === 'POST') {
      auditLogger.info('Withdraw operation initiated', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        body: req.body,
      });
    }

    next();
  };
}

// Combined logging middleware
export function createLoggingMiddleware() {
  return [
    requestLoggingMiddleware(),
    securityLoggingMiddleware(),
    performanceLoggingMiddleware(),
    auditLoggingMiddleware(),
    errorLoggingMiddleware(),
  ];
}

export default {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  dbQueryLoggingMiddleware,
  solanaTransactionLoggingMiddleware,
  securityLoggingMiddleware,
  performanceLoggingMiddleware,
  rateLimitLoggingMiddleware,
  auditLoggingMiddleware,
  createLoggingMiddleware,
};
