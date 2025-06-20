import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { 
  User, 
  UserRole, 
  Permission, 
  LoginRequest, 
  LoginResponse, 
  CreateUserRequest, 
  UpdateUserRequest,
  ChangePasswordRequest,
  ApiKeyInfo,
  AuthToken,
  AuthConfig
} from './types';

export class UserService {
  private users: Map<string, User> = new Map();
  private apiKeys: Map<string, ApiKeyInfo> = new Map();
  private loginAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.initializeDefaultUsers();
  }

  private initializeDefaultUsers(): void {
    // Create default admin user
    const adminUser: User = {
      id: 'admin-001',
      email: 'admin@cipherpay.com',
      username: 'admin',
      role: UserRole.ADMIN,
      isActive: true,
      createdAt: new Date(),
      permissions: Object.values(Permission)
    };

    // Create default operator user
    const operatorUser: User = {
      id: 'operator-001',
      email: 'operator@cipherpay.com',
      username: 'operator',
      role: UserRole.OPERATOR,
      isActive: true,
      createdAt: new Date(),
      permissions: [
        Permission.SUBMIT_TRANSACTION,
        Permission.VIEW_TRANSACTIONS,
        Permission.VERIFY_PROOF,
        Permission.VIEW_PROOF_STATUS,
        Permission.VIEW_SYSTEM_STATUS,
        Permission.VIEW_FEES,
        Permission.VIEW_CIRCUITS
      ]
    };

    // Create default readonly user
    const readonlyUser: User = {
      id: 'readonly-001',
      email: 'readonly@cipherpay.com',
      username: 'readonly',
      role: UserRole.READONLY,
      isActive: true,
      createdAt: new Date(),
      permissions: [
        Permission.VIEW_TRANSACTIONS,
        Permission.VIEW_PROOF_STATUS,
        Permission.VIEW_SYSTEM_STATUS,
        Permission.VIEW_FEES,
        Permission.VIEW_CIRCUITS
      ]
    };

    // Set default passwords (should be changed in production)
    this.users.set(adminUser.id, { ...adminUser, password: this.hashPassword('admin123') });
    this.users.set(operatorUser.id, { ...operatorUser, password: this.hashPassword('operator123') });
    this.users.set(readonlyUser.id, { ...readonlyUser, password: this.hashPassword('readonly123') });
  }

  private hashPassword(password: string): string {
    return bcrypt.hashSync(password, this.config.bcryptRounds);
  }

  private verifyPassword(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash);
  }

  private generateToken(user: User): string {
    const payload: AuthToken = {
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, this.config.jwtSecret, { expiresIn: this.config.jwtExpiresIn });
  }

  private isAccountLocked(email: string): boolean {
    const attempts = this.loginAttempts.get(email);
    if (!attempts) return false;

    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();
    return attempts.count >= this.config.maxLoginAttempts && 
           timeSinceLastAttempt < this.config.lockoutDuration;
  }

  private recordLoginAttempt(email: string, success: boolean): void {
    const attempts = this.loginAttempts.get(email) || { count: 0, lastAttempt: new Date() };
    
    if (success) {
      attempts.count = 0;
    } else {
      attempts.count++;
    }
    
    attempts.lastAttempt = new Date();
    this.loginAttempts.set(email, attempts);
  }

  async login(loginRequest: LoginRequest): Promise<LoginResponse> {
    const { email, password } = loginRequest;

    // Check if account is locked
    if (this.isAccountLocked(email)) {
      throw new Error('Account is temporarily locked due to too many failed login attempts');
    }

    // Find user by email
    const user = Array.from(this.users.values()).find(u => u.email === email);
    if (!user || !user.isActive) {
      this.recordLoginAttempt(email, false);
      throw new Error('Invalid credentials');
    }

    // Verify password
    if (!this.verifyPassword(password, user.password!)) {
      this.recordLoginAttempt(email, false);
      throw new Error('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    this.users.set(user.id, user);

    // Record successful login
    this.recordLoginAttempt(email, true);

    // Generate token
    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      },
      expiresIn: 24 * 60 * 60 // 24 hours in seconds
    };
  }

  async createUser(createRequest: CreateUserRequest, requesterRole: UserRole): Promise<User> {
    // Only admins can create users
    if (requesterRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions');
    }

    // Check if email already exists
    const existingUser = Array.from(this.users.values()).find(u => u.email === createRequest.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const user: User = {
      id: uuidv4(),
      email: createRequest.email,
      username: createRequest.username,
      role: createRequest.role,
      isActive: true,
      createdAt: new Date(),
      permissions: createRequest.permissions || this.getDefaultPermissions(createRequest.role),
      password: this.hashPassword(createRequest.password)
    };

    this.users.set(user.id, user);
    return { ...user, password: undefined };
  }

  async updateUser(userId: string, updateRequest: UpdateUserRequest, requesterRole: UserRole): Promise<User> {
    // Only admins can update users
    if (requesterRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions');
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser: User = {
      ...user,
      ...updateRequest,
      permissions: updateRequest.permissions || user.permissions
    };

    this.users.set(userId, updatedUser);
    return { ...updatedUser, password: undefined };
  }

  async changePassword(userId: string, changeRequest: ChangePasswordRequest): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    if (!this.verifyPassword(changeRequest.currentPassword, user.password!)) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    user.password = this.hashPassword(changeRequest.newPassword);
    this.users.set(userId, user);
  }

  async generateApiKey(request: GenerateApiKeyRequest, requesterRole: UserRole): Promise<ApiKeyInfo> {
    // Only admins can generate API keys
    if (requesterRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions');
    }

    const user = this.users.get(request.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const apiKey = `cp_${uuidv4().replace(/-/g, '')}`;
    const apiKeyInfo: ApiKeyInfo = {
      id: uuidv4(),
      userId: request.userId,
      key: apiKey,
      description: request.description,
      createdAt: new Date(),
      isActive: true
    };

    this.apiKeys.set(apiKeyInfo.id, apiKeyInfo);
    return apiKeyInfo;
  }

  async validateApiKey(apiKey: string): Promise<User | null> {
    const apiKeyInfo = Array.from(this.apiKeys.values()).find(ak => ak.key === apiKey);
    if (!apiKeyInfo || !apiKeyInfo.isActive) {
      return null;
    }

    const user = this.users.get(apiKeyInfo.userId);
    if (!user || !user.isActive) {
      return null;
    }

    // Update last used timestamp
    apiKeyInfo.lastUsedAt = new Date();
    this.apiKeys.set(apiKeyInfo.id, apiKeyInfo);

    return { ...user, password: undefined };
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as AuthToken;
      const user = this.users.get(decoded.userId);
      
      if (!user || !user.isActive) {
        return null;
      }

      return { ...user, password: undefined };
    } catch (error) {
      return null;
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    return user ? { ...user, password: undefined } : null;
  }

  async getAllUsers(requesterRole: UserRole): Promise<User[]> {
    // Only admins can view all users
    if (requesterRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions');
    }

    return Array.from(this.users.values()).map(user => ({ ...user, password: undefined }));
  }

  async deactivateUser(userId: string, requesterRole: UserRole): Promise<void> {
    // Only admins can deactivate users
    if (requesterRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions');
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.isActive = false;
    this.users.set(userId, user);
  }

  async deactivateApiKey(apiKeyId: string, requesterRole: UserRole): Promise<void> {
    // Only admins can deactivate API keys
    if (requesterRole !== UserRole.ADMIN) {
      throw new Error('Insufficient permissions');
    }

    const apiKey = this.apiKeys.get(apiKeyId);
    if (!apiKey) {
      throw new Error('API key not found');
    }

    apiKey.isActive = false;
    this.apiKeys.set(apiKeyId, apiKey);
  }

  private getDefaultPermissions(role: UserRole): Permission[] {
    switch (role) {
      case UserRole.ADMIN:
        return Object.values(Permission);
      case UserRole.OPERATOR:
        return [
          Permission.SUBMIT_TRANSACTION,
          Permission.VIEW_TRANSACTIONS,
          Permission.VERIFY_PROOF,
          Permission.VIEW_PROOF_STATUS,
          Permission.VIEW_SYSTEM_STATUS,
          Permission.VIEW_FEES,
          Permission.VIEW_CIRCUITS
        ];
      case UserRole.USER:
        return [
          Permission.SUBMIT_TRANSACTION,
          Permission.VIEW_TRANSACTIONS,
          Permission.VERIFY_PROOF,
          Permission.VIEW_PROOF_STATUS,
          Permission.VIEW_FEES,
          Permission.VIEW_CIRCUITS
        ];
      case UserRole.READONLY:
        return [
          Permission.VIEW_TRANSACTIONS,
          Permission.VIEW_PROOF_STATUS,
          Permission.VIEW_SYSTEM_STATUS,
          Permission.VIEW_FEES,
          Permission.VIEW_CIRCUITS
        ];
      default:
        return [];
    }
  }

  hasPermission(user: User, permission: Permission): boolean {
    return user.permissions.includes(permission);
  }

  hasAnyPermission(user: User, permissions: Permission[]): boolean {
    return permissions.some(permission => user.permissions.includes(permission));
  }

  hasAllPermissions(user: User, permissions: Permission[]): boolean {
    return permissions.every(permission => user.permissions.includes(permission));
  }
} 