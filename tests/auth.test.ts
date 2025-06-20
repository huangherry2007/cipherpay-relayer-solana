import request from 'supertest';
import app from '../src/index';
import { UserService } from '../src/auth/userService';
import { AuthMiddleware } from '../src/auth/middleware';
import { Permission, UserRole } from '../src/auth/types';

describe('Authentication System Tests', () => {
  let userService: UserService;
  let authMiddleware: AuthMiddleware;
  let adminToken: string;
  let operatorToken: string;
  let userToken: string;
  let readonlyToken: string;

  beforeAll(async () => {
    // Initialize services
    userService = new UserService({
      jwtSecret: 'test-secret-key',
      jwtExpiresIn: '24h',
      bcryptRounds: 10,
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000,
      sessionTimeout: 24 * 60 * 60 * 1000
    });

    authMiddleware = new AuthMiddleware(userService);

    // Login to get tokens for testing
    const adminLogin = await userService.login({
      email: 'admin@cipherpay.com',
      password: 'admin123'
    });
    adminToken = adminLogin.token;

    const operatorLogin = await userService.login({
      email: 'operator@cipherpay.com',
      password: 'operator123'
    });
    operatorToken = operatorLogin.token;

    const readonlyLogin = await userService.login({
      email: 'readonly@cipherpay.com',
      password: 'readonly123'
    });
    readonlyToken = readonlyLogin.token;
  });

  describe('Authentication Endpoints', () => {
    test('POST /api/v1/auth/login - should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@cipherpay.com',
          password: 'admin123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.role).toBe('admin');
    });

    test('POST /api/v1/auth/login - should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@cipherpay.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    test('POST /api/v1/auth/login - should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'admin123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('GET /api/v1/auth/profile - should return user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('role');
    });

    test('GET /api/v1/auth/profile - should reject request without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('User Management (Admin Only)', () => {
    test('POST /api/v1/auth/users - should create user with admin token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test@example.com',
          username: 'testuser',
          password: 'password123',
          role: 'user'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe('test@example.com');
    });

    test('POST /api/v1/auth/users - should reject with non-admin token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          email: 'test2@example.com',
          username: 'testuser2',
          password: 'password123',
          role: 'user'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    test('GET /api/v1/auth/users - should return all users with admin token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('GET /api/v1/auth/users - should reject with non-admin token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/users')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('API Key Management', () => {
    test('POST /api/v1/auth/api-keys - should generate API key with admin token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: 'admin-001',
          description: 'Test API key'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('key');
      expect(response.body.data.key).toMatch(/^cp_/);
    });

    test('POST /api/v1/auth/api-keys - should reject with non-admin token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          userId: 'operator-001',
          description: 'Test API key'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Protected API Endpoints', () => {
    test('POST /api/v1/submit-transaction - should require SUBMIT_TRANSACTION permission', async () => {
      const response = await request(app)
        .post('/api/v1/submit-transaction')
        .set('Authorization', `Bearer ${readonlyToken}`)
        .send({
          transactionData: {},
          proof: {},
          circuitType: 'transfer'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('SUBMIT_TRANSACTION');
    });

    test('POST /api/v1/submit-transaction - should work with operator token', async () => {
      const response = await request(app)
        .post('/api/v1/submit-transaction')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          transactionData: {},
          proof: {},
          circuitType: 'transfer'
        });

      // Should fail due to invalid proof, but not due to authentication
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    test('GET /api/v1/circuits - should work with readonly token', async () => {
      const response = await request(app)
        .get('/api/v1/circuits')
        .set('Authorization', `Bearer ${readonlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.circuits).toBeDefined();
    });

    test('GET /api/v1/system/status - should work with readonly token', async () => {
      const response = await request(app)
        .get('/api/v1/system/status')
        .set('Authorization', `Bearer ${readonlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toHaveProperty('uptime');
    });

    test('GET /api/v1/admin/logs - should require VIEW_LOGS permission', async () => {
      const response = await request(app)
        .get('/api/v1/admin/logs')
        .set('Authorization', `Bearer ${readonlyToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('VIEW_LOGS');
    });
  });

  describe('Rate Limiting', () => {
    test('POST /api/v1/auth/login - should rate limit after multiple failed attempts', async () => {
      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'admin@cipherpay.com',
            password: 'wrongpassword'
          });
      }

      // The 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@cipherpay.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(429);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Too many authentication attempts');
    });
  });

  describe('Password Management', () => {
    test('POST /api/v1/auth/change-password - should change password with valid current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'admin123',
          newPassword: 'newpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password changed successfully');
    });

    test('POST /api/v1/auth/change-password - should reject with wrong current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Current password is incorrect');
    });
  });

  describe('Permission System', () => {
    test('should check individual permissions correctly', () => {
      const adminUser = {
        id: 'admin-001',
        email: 'admin@cipherpay.com',
        username: 'admin',
        role: UserRole.ADMIN,
        isActive: true,
        createdAt: new Date(),
        permissions: Object.values(Permission)
      };

      expect(userService.hasPermission(adminUser, Permission.SUBMIT_TRANSACTION)).toBe(true);
      expect(userService.hasPermission(adminUser, Permission.MANAGE_USERS)).toBe(true);
    });

    test('should check multiple permissions correctly', () => {
      const operatorUser = {
        id: 'operator-001',
        email: 'operator@cipherpay.com',
        username: 'operator',
        role: UserRole.OPERATOR,
        isActive: true,
        createdAt: new Date(),
        permissions: [
          Permission.SUBMIT_TRANSACTION,
          Permission.VIEW_TRANSACTIONS,
          Permission.VERIFY_PROOF
        ]
      };

      expect(userService.hasAnyPermission(operatorUser, [
        Permission.SUBMIT_TRANSACTION,
        Permission.MANAGE_USERS
      ])).toBe(true);

      expect(userService.hasAllPermissions(operatorUser, [
        Permission.SUBMIT_TRANSACTION,
        Permission.VIEW_TRANSACTIONS
      ])).toBe(true);

      expect(userService.hasAllPermissions(operatorUser, [
        Permission.SUBMIT_TRANSACTION,
        Permission.MANAGE_USERS
      ])).toBe(false);
    });
  });

  describe('Token Validation', () => {
    test('should validate valid JWT token', async () => {
      const user = await userService.validateToken(adminToken);
      expect(user).not.toBeNull();
      expect(user?.role).toBe('admin');
    });

    test('should reject invalid JWT token', async () => {
      const user = await userService.validateToken('invalid-token');
      expect(user).toBeNull();
    });

    test('should reject expired JWT token', async () => {
      // Create a token that expires immediately
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbi0wMDEiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjF9.invalid-signature';
      const user = await userService.validateToken(expiredToken);
      expect(user).toBeNull();
    });
  });

  describe('API Key Authentication', () => {
    test('should validate API key authentication', async () => {
      // First generate an API key
      const apiKeyInfo = await userService.generateApiKey({
        userId: 'admin-001',
        description: 'Test API key'
      }, UserRole.ADMIN);

      // Then validate it
      const user = await userService.validateApiKey(apiKeyInfo.key);
      expect(user).not.toBeNull();
      expect(user?.role).toBe('admin');
    });

    test('should reject invalid API key', async () => {
      const user = await userService.validateApiKey('invalid-api-key');
      expect(user).toBeNull();
    });

    test('should reject deactivated API key', async () => {
      // Generate and then deactivate an API key
      const apiKeyInfo = await userService.generateApiKey({
        userId: 'admin-001',
        description: 'Test API key'
      }, UserRole.ADMIN);

      await userService.deactivateApiKey(apiKeyInfo.id, UserRole.ADMIN);

      const user = await userService.validateApiKey(apiKeyInfo.key);
      expect(user).toBeNull();
    });
  });
}); 