import { Request, Response, NextFunction } from 'express';
import { UserService } from './userService';
import { Permission, User } from './types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export class AuthMiddleware {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * Middleware to authenticate requests using JWT token or API key
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string;

      if (!authHeader && !apiKey) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      let user: User | null = null;

      // Try API key authentication first
      if (apiKey) {
        user = await this.userService.validateApiKey(apiKey);
      }

      // Try JWT token authentication if API key failed
      if (!user && authHeader) {
        const token = authHeader.replace('Bearer ', '');
        user = await this.userService.validateToken(token);
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid authentication credentials'
        });
        return;
      }

      // Check if user is active
      if (!user.isActive) {
        res.status(403).json({
          success: false,
          error: 'User account is deactivated'
        });
        return;
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Authentication error'
      });
    }
  };

  /**
   * Middleware to require specific permission
   */
  requirePermission = (permission: Permission) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      if (!this.userService.hasPermission(req.user, permission)) {
        res.status(403).json({
          success: false,
          error: `Insufficient permissions. Required: ${permission}`
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to require any of the specified permissions
   */
  requireAnyPermission = (permissions: Permission[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      if (!this.userService.hasAnyPermission(req.user, permissions)) {
        res.status(403).json({
          success: false,
          error: `Insufficient permissions. Required one of: ${permissions.join(', ')}`
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to require all specified permissions
   */
  requireAllPermissions = (permissions: Permission[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      if (!this.userService.hasAllPermissions(req.user, permissions)) {
        res.status(403).json({
          success: false,
          error: `Insufficient permissions. Required all: ${permissions.join(', ')}`
        });
        return;
      }

      next();
    };
  };

  /**
   * Middleware to require admin role
   */
  requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (req.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
      return;
    }

    next();
  };

  /**
   * Middleware to require operator or admin role
   */
  requireOperatorOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!['admin', 'operator'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Operator or admin access required'
      });
      return;
    }

    next();
  };

  /**
   * Optional authentication middleware - doesn't fail if no auth provided
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string;

      if (!authHeader && !apiKey) {
        // No authentication provided, continue without user
        next();
        return;
      }

      let user: User | null = null;

      // Try API key authentication first
      if (apiKey) {
        user = await this.userService.validateApiKey(apiKey);
      }

      // Try JWT token authentication if API key failed
      if (!user && authHeader) {
        const token = authHeader.replace('Bearer ', '');
        user = await this.userService.validateToken(token);
      }

      if (user && user.isActive) {
        req.user = user;
      }

      next();
    } catch (error) {
      // Continue without authentication on error
      next();
    }
  };

  /**
   * Rate limiting middleware for authentication endpoints
   */
  authRateLimit = (req: Request, res: Response, next: NextFunction): void => {
    // This would typically use a rate limiting library
    // For now, we'll implement basic rate limiting
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Simple in-memory rate limiting (in production, use Redis)
    if (!this.authAttempts) {
      this.authAttempts = new Map();
    }

    const attempts = this.authAttempts.get(clientIp) || { count: 0, resetTime: now + 15 * 60 * 1000 }; // 15 minutes

    if (now > attempts.resetTime) {
      attempts.count = 0;
      attempts.resetTime = now + 15 * 60 * 1000;
    }

    attempts.count++;

    if (attempts.count > 5) { // Max 5 attempts per 15 minutes
      res.status(429).json({
        success: false,
        error: 'Too many authentication attempts. Please try again later.'
      });
      return;
    }

    this.authAttempts.set(clientIp, attempts);
    next();
  };

  private authAttempts: Map<string, { count: number; resetTime: number }> = new Map();
} 