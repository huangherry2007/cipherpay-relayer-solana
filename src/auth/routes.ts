import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { UserService } from './userService';
import { AuthMiddleware } from './middleware';
import { Permission, UserRole } from './types';

export class AuthRoutes {
  private router: Router;
  private userService: UserService;
  private authMiddleware: AuthMiddleware;

  constructor(userService: UserService, authMiddleware: AuthMiddleware) {
    this.router = Router();
    this.userService = userService;
    this.authMiddleware = authMiddleware;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Public routes (with rate limiting)
    this.router.post('/login', this.authMiddleware.authRateLimit, this.loginValidation, this.login);
    
    // Protected routes
    this.router.post('/logout', this.authMiddleware.authenticate, this.logout);
    this.router.post('/change-password', this.authMiddleware.authenticate, this.changePasswordValidation, this.changePassword);
    this.router.get('/profile', this.authMiddleware.authenticate, this.getProfile);
    
    // Admin-only routes
    this.router.post('/users', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.createUserValidation, this.createUser);
    this.router.get('/users', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.getAllUsers);
    this.router.get('/users/:userId', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.getUser);
    this.router.put('/users/:userId', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.updateUserValidation, this.updateUser);
    this.router.delete('/users/:userId', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.deactivateUser);
    
    // API key management
    this.router.post('/api-keys', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.generateApiKeyValidation, this.generateApiKey);
    this.router.get('/api-keys', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.getAllApiKeys);
    this.router.delete('/api-keys/:apiKeyId', this.authMiddleware.authenticate, this.authMiddleware.requireAdmin, this.deactivateApiKey);
  }

  // Validation middleware
  private loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
  ];

  private createUserValidation = [
    body('email').isEmail().normalizeEmail(),
    body('username').isLength({ min: 3, max: 50 }),
    body('password').isLength({ min: 8 }),
    body('role').isIn(Object.values(UserRole))
  ];

  private updateUserValidation = [
    body('email').optional().isEmail().normalizeEmail(),
    body('username').optional().isLength({ min: 3, max: 50 }),
    body('role').optional().isIn(Object.values(UserRole)),
    body('isActive').optional().isBoolean()
  ];

  private changePasswordValidation = [
    body('currentPassword').isLength({ min: 6 }),
    body('newPassword').isLength({ min: 8 })
  ];

  private generateApiKeyValidation = [
    body('userId').isUUID(),
    body('description').optional().isLength({ max: 200 })
  ];

  // Route handlers
  private login = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
      return;
    }

    try {
      const { email, password } = req.body;
      const result = await this.userService.login({ email, password });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      });
    }
  };

  private logout = async (req: Request, res: Response): Promise<void> => {
    // In a real implementation, you might want to blacklist the token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  };

  private changePassword = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
      return;
    }

    try {
      const { currentPassword, newPassword } = req.body;
      await this.userService.changePassword(req.user!.id, { currentPassword, newPassword });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Password change failed'
      });
    }
  };

  private getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.userService.getUserById(req.user!.id);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  };

  private createUser = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
      return;
    }

    try {
      const user = await this.userService.createUser(req.body, req.user!.role);

      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create user'
      });
    }
  };

  private getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.userService.getAllUsers(req.user!.role);

      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      res.status(403).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get users'
      });
    }
  };

  private getUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const user = await this.userService.getUserById(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get user'
      });
    }
  };

  private updateUser = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
      return;
    }

    try {
      const { userId } = req.params;
      const user = await this.userService.updateUser(userId, req.body, req.user!.role);

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update user'
      });
    }
  };

  private deactivateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      await this.userService.deactivateUser(userId, req.user!.role);

      res.json({
        success: true,
        message: 'User deactivated successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate user'
      });
    }
  };

  private generateApiKey = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
      return;
    }

    try {
      const apiKey = await this.userService.generateApiKey(req.body, req.user!.role);

      res.status(201).json({
        success: true,
        data: apiKey
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate API key'
      });
    }
  };

  private getAllApiKeys = async (req: Request, res: Response): Promise<void> => {
    try {
      // This would need to be implemented in UserService
      res.json({
        success: true,
        data: [],
        message: 'API key listing not implemented yet'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get API keys'
      });
    }
  };

  private deactivateApiKey = async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId } = req.params;
      await this.userService.deactivateApiKey(apiKeyId, req.user!.role);

      res.json({
        success: true,
        message: 'API key deactivated successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate API key'
      });
    }
  };

  public getRouter(): Router {
    return this.router;
  }
} 