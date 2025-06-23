import request from 'supertest';
import app, { userService, authMiddleware } from '../src/index';
import { Permission, UserRole } from '../src/auth/types';

describe('Authentication System Tests', () => {
  let adminToken: string;
  let operatorToken: string;
  let userToken: string;
  let readonlyToken: string;

  beforeAll(async () => {
    // Use the same services as the main application
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

  afterAll(async () => {
    // Reset admin password in case it was changed during tests
    const adminUser = Array.from(userService['users'].values()).find(u => u.email === 'admin@cipherpay.com');
    if (adminUser) {
      adminUser.password = userService['hashPassword']('admin123');
      userService['users'].set(adminUser.id, adminUser);
    }
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
      expect(response.body.error).toBe('Admin access required');
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
      // Get the admin user's ID from the login response
      const adminLogin = await userService.login({
        email: 'admin@cipherpay.com',
        password: 'admin123'
      });
      const adminUserId = adminLogin.user.id;

      const response = await request(app)
        .post('/api/v1/auth/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: adminUserId, // Use the actual admin user ID
          description: 'Test API key'
        });

      if (response.status !== 201) {
        console.log('API Key generation failed:', response.body);
      }

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
          userId: '550e8400-e29b-41d4-a716-446655440001',
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
          transactionData: { test: 'data' },
          proof: { test: 'proof' },
          circuitType: 'transfer'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('submit_transaction');
    });

    test('POST /api/v1/submit-transaction - should work with operator token', async () => {
      const response = await request(app)
        .post('/api/v1/submit-transaction')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          transactionData: { test: 'data' },
          proof: { test: 'proof' },
          circuitType: 'transfer'
        });

      // This will fail due to invalid proof, but should pass authentication
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid zero-knowledge proof');
    });

    test('GET /api/v1/circuits - should work with readonly token', async () => {
      const response = await request(app)
        .get('/api/v1/circuits')
        .set('Authorization', `Bearer ${readonlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /api/v1/system/status - should work with readonly token', async () => {
      const response = await request(app)
        .get('/api/v1/system/status')
        .set('Authorization', `Bearer ${readonlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /api/v1/admin/logs - should require VIEW_LOGS permission', async () => {
      const response = await request(app)
        .get('/api/v1/admin/logs')
        .set('Authorization', `Bearer ${readonlyToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('view_logs');
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
    test('should check individual permissions correctly', async () => {
      // Get the actual admin user from the service using the existing token
      const adminUser = await userService.validateToken(adminToken);

      expect(userService.hasPermission(adminUser!, Permission.SUBMIT_TRANSACTION)).toBe(true);
      expect(userService.hasPermission(adminUser!, Permission.MANAGE_USERS)).toBe(true);
    });

    test('should check multiple permissions correctly', async () => {
      // Get the actual operator user from the service using the existing token
      const operatorUser = await userService.validateToken(operatorToken);

      expect(userService.hasAnyPermission(operatorUser!, [
        Permission.SUBMIT_TRANSACTION,
        Permission.MANAGE_USERS
      ])).toBe(true);

      expect(userService.hasAllPermissions(operatorUser!, [
        Permission.SUBMIT_TRANSACTION,
        Permission.VIEW_TRANSACTIONS
      ])).toBe(true);

      expect(userService.hasAllPermissions(operatorUser!, [
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
      // Get the admin user's ID from the existing token
      const adminUser = await userService.validateToken(adminToken);
      const adminUserId = adminUser!.id;

      // First generate an API key
      const apiKeyInfo = await userService.generateApiKey({
        userId: adminUserId,
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
      // Get the admin user's ID from the existing token
      const adminUser = await userService.validateToken(adminToken);
      const adminUserId = adminUser!.id;

      // Generate and then deactivate an API key
      const apiKeyInfo = await userService.generateApiKey({
        userId: adminUserId,
        description: 'Test API key'
      }, UserRole.ADMIN);

      await userService.deactivateApiKey(apiKeyInfo.id, UserRole.ADMIN);

      const user = await userService.validateApiKey(apiKeyInfo.key);
      expect(user).toBeNull();
    });
  });
}); 