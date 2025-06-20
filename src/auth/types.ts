export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  apiKey?: string;
  password?: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  permissions: Permission[];
}

export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  USER = 'user',
  READONLY = 'readonly'
}

export enum Permission {
  // Transaction permissions
  SUBMIT_TRANSACTION = 'submit_transaction',
  VIEW_TRANSACTIONS = 'view_transactions',
  CANCEL_TRANSACTION = 'cancel_transaction',
  
  // Proof verification permissions
  VERIFY_PROOF = 'verify_proof',
  VIEW_PROOF_STATUS = 'view_proof_status',
  
  // System permissions
  VIEW_SYSTEM_STATUS = 'view_system_status',
  MANAGE_USERS = 'manage_users',
  VIEW_LOGS = 'view_logs',
  MANAGE_CONFIG = 'manage_config',
  
  // Fee management
  VIEW_FEES = 'view_fees',
  UPDATE_FEES = 'update_fees',
  
  // Circuit management
  VIEW_CIRCUITS = 'view_circuits',
  MANAGE_CIRCUITS = 'manage_circuits'
}

export interface AuthToken {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  exp: number;
  iat: number;
}

export interface ApiKeyAuth {
  apiKey: string;
  userId: string;
  role: UserRole;
  permissions: Permission[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
    permissions: Permission[];
  };
  expiresIn: number;
}

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  role: UserRole;
  permissions?: Permission[];
}

export interface UpdateUserRequest {
  email?: string;
  username?: string;
  role?: UserRole;
  permissions?: Permission[];
  isActive?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface GenerateApiKeyRequest {
  userId: string;
  description?: string;
}

export interface ApiKeyInfo {
  id: string;
  userId: string;
  key: string;
  description?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  isActive: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface SecurityConfig {
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
} 