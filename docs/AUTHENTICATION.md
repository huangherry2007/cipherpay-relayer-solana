# Authentication & Authorization Guide

This document explains the authentication and authorization system implemented in the CipherPay Solana Relayer.

## Overview

The relayer implements a comprehensive authentication and authorization system with the following features:

- **JWT Token Authentication**: Secure token-based authentication
- **API Key Authentication**: Alternative authentication method for automated systems
- **Role-Based Access Control (RBAC)**: Fine-grained permission system
- **Rate Limiting**: Protection against brute force attacks
- **Account Lockout**: Automatic account protection after failed attempts
- **Password Security**: Bcrypt hashing with configurable rounds

## User Roles

### Admin
- **Full system access**
- Can manage users and API keys
- Can view system logs and configuration
- Can perform all operations

**Default Credentials:**
- Email: `admin@cipherpay.com`
- Password: `admin123`

### Operator
- **Operational access**
- Can submit and manage transactions
- Can verify proofs
- Can view system status and fees
- Cannot manage users or system configuration

**Default Credentials:**
- Email: `operator@cipherpay.com`
- Password: `operator123`

### User
- **Standard user access**
- Can submit transactions
- Can verify proofs
- Can view transaction history and fees
- Cannot access system administration

### Readonly
- **Read-only access**
- Can view transactions and system status
- Can view fees and circuit information
- Cannot submit transactions or modify data

**Default Credentials:**
- Email: `readonly@cipherpay.com`
- Password: `readonly123`

## Permissions

| Permission | Description | Admin | Operator | User | Readonly |
|------------|-------------|-------|----------|------|----------|
| `submit_transaction` | Submit private transactions | ✅ | ✅ | ✅ | ❌ |
| `view_transactions` | View transaction history | ✅ | ✅ | ✅ | ✅ |
| `cancel_transaction` | Cancel pending transactions | ✅ | ✅ | ❌ | ❌ |
| `verify_proof` | Verify zero-knowledge proofs | ✅ | ✅ | ✅ | ❌ |
| `view_proof_status` | View proof verification status | ✅ | ✅ | ✅ | ✅ |
| `view_system_status` | View system health and metrics | ✅ | ✅ | ❌ | ✅ |
| `manage_users` | Create, update, and deactivate users | ✅ | ❌ | ❌ | ❌ |
| `view_logs` | View system logs | ✅ | ❌ | ❌ | ❌ |
| `manage_config` | Modify system configuration | ✅ | ❌ | ❌ | ❌ |
| `view_fees` | View transaction fees | ✅ | ✅ | ✅ | ✅ |
| `update_fees` | Update fee structure | ✅ | ❌ | ❌ | ❌ |
| `view_circuits` | View supported circuits | ✅ | ✅ | ✅ | ✅ |
| `manage_circuits` | Manage circuit configurations | ✅ | ❌ | ❌ | ❌ |

## Authentication Methods

### 1. JWT Token Authentication

**Login:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cipherpay.com",
    "password": "admin123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "admin-001",
      "email": "admin@cipherpay.com",
      "username": "admin",
      "role": "admin",
      "permissions": ["submit_transaction", "view_transactions", ...]
    },
    "expiresIn": 86400
  }
}
```

**Using the Token:**
```bash
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 2. API Key Authentication

**Generate API Key (Admin Only):**
```bash
curl -X POST http://localhost:3000/api/v1/auth/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-001",
    "description": "API key for automated transactions"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "key-001",
    "userId": "user-001",
    "key": "cp_abc123def456ghi789",
    "description": "API key for automated transactions",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "isActive": true
  }
}
```

**Using the API Key:**
```bash
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "X-API-Key: cp_abc123def456ghi789"
```

## Protected Endpoints

### Transaction Endpoints

**Submit Transaction (requires `submit_transaction` permission):**
```bash
curl -X POST http://localhost:3000/api/v1/submit-transaction \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionData": {...},
    "proof": {...},
    "circuitType": "transfer"
  }'
```

**Get Transaction Status (requires `view_transactions` permission):**
```bash
curl -X GET http://localhost:3000/api/v1/transaction/<tx-hash> \
  -H "Authorization: Bearer <token>"
```

### Proof Verification

**Verify Proof (requires `verify_proof` permission):**
```bash
curl -X POST http://localhost:3000/api/v1/verify-proof \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "circuitType": "transfer",
    "proof": {...}
  }'
```

### System Endpoints

**Get System Status (requires `view_system_status` permission):**
```bash
curl -X GET http://localhost:3000/api/v1/system/status \
  -H "Authorization: Bearer <token>"
```

**Get Supported Circuits (requires `view_circuits` permission):**
```bash
curl -X GET http://localhost:3000/api/v1/circuits \
  -H "Authorization: Bearer <token>"
```

### Admin Endpoints

**View Logs (requires `view_logs` permission):**
```bash
curl -X GET http://localhost:3000/api/v1/admin/logs \
  -H "Authorization: Bearer <admin-token>"
```

**Create User (requires `manage_users` permission):**
```bash
curl -X POST http://localhost:3000/api/v1/auth/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "username": "newuser",
    "password": "securepassword123",
    "role": "user"
  }'
```

## Security Features

### Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 failed attempts per 15 minutes per IP
- **Slow Down**: After 50 requests, additional requests are delayed by 500ms

### Account Protection

- **Failed Login Attempts**: Account locked after 5 failed attempts
- **Lockout Duration**: 15 minutes
- **Automatic Reset**: Lockout resets after successful login

### Password Security

- **Hashing**: Bcrypt with 12 rounds (configurable)
- **Minimum Length**: 8 characters for new passwords
- **Validation**: Email format validation for usernames

### Token Security

- **JWT Secret**: Configurable via `JWT_SECRET` environment variable
- **Expiration**: 24 hours (configurable)
- **Algorithm**: HS256

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# Security Configuration
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000  # 15 minutes in milliseconds
SESSION_TIMEOUT=86400000  # 24 hours in milliseconds

# CORS Configuration
CORS_ORIGIN=*
```

### Default Configuration

```typescript
const defaultConfig = {
  jwtSecret: 'your-super-secret-jwt-key-change-in-production',
  jwtExpiresIn: '24h',
  bcryptRounds: 12,
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours
};
```

## Error Responses

### Authentication Errors

```json
{
  "success": false,
  "error": "Authentication required"
}
```

### Authorization Errors

```json
{
  "success": false,
  "error": "Insufficient permissions. Required: submit_transaction"
}
```

### Rate Limiting Errors

```json
{
  "success": false,
  "error": "Too many requests from this IP, please try again later."
}
```

### Validation Errors

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "type": "field",
      "value": "invalid-email",
      "msg": "Invalid value",
      "path": "email",
      "location": "body"
    }
  ]
}
```

## Best Practices

### For Developers

1. **Always validate permissions** before performing sensitive operations
2. **Use HTTPS** in production for all API calls
3. **Store tokens securely** in client applications
4. **Implement token refresh** for long-running applications
5. **Log authentication events** for security monitoring

### For Administrators

1. **Change default passwords** immediately after deployment
2. **Use strong JWT secrets** in production
3. **Monitor failed login attempts** for security threats
4. **Regularly rotate API keys** for automated systems
5. **Review user permissions** periodically

### For Users

1. **Use strong passwords** (minimum 8 characters)
2. **Keep tokens secure** and don't share them
3. **Log out** when using shared computers
4. **Report suspicious activity** to administrators
5. **Use API keys** for automated systems instead of user tokens

## Troubleshooting

### Common Issues

1. **"Authentication required"**
   - Check if token is included in Authorization header
   - Verify token hasn't expired
   - Ensure API key is included in X-API-Key header

2. **"Insufficient permissions"**
   - Check user role and permissions
   - Contact administrator to grant required permissions
   - Verify endpoint requires specific permission

3. **"Too many requests"**
   - Wait for rate limit window to reset
   - Reduce request frequency
   - Contact administrator if legitimate high-volume usage

4. **"Account locked"**
   - Wait for lockout period to expire
   - Contact administrator to unlock account
   - Reset password if forgotten

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=auth:*
```

This will log authentication events, permission checks, and security-related activities.

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/login` | Login with credentials | No |
| POST | `/api/v1/auth/logout` | Logout (invalidate token) | Yes |
| GET | `/api/v1/auth/profile` | Get user profile | Yes |
| POST | `/api/v1/auth/change-password` | Change password | Yes |
| POST | `/api/v1/auth/users` | Create user | Admin |
| GET | `/api/v1/auth/users` | List all users | Admin |
| PUT | `/api/v1/auth/users/:id` | Update user | Admin |
| DELETE | `/api/v1/auth/users/:id` | Deactivate user | Admin |
| POST | `/api/v1/auth/api-keys` | Generate API key | Admin |
| GET | `/api/v1/auth/api-keys` | List API keys | Admin |
| DELETE | `/api/v1/auth/api-keys/:id` | Deactivate API key | Admin |

### Protected API Endpoints

| Method | Endpoint | Permission Required |
|--------|----------|-------------------|
| POST | `/api/v1/submit-transaction` | `submit_transaction` |
| GET | `/api/v1/transaction/:id` | `view_transactions` |
| POST | `/api/v1/transaction/:id/cancel` | `cancel_transaction` |
| POST | `/api/v1/estimate-fees` | `view_fees` |
| POST | `/api/v1/verify-proof` | `verify_proof` |
| GET | `/api/v1/circuits` | `view_circuits` |
| GET | `/api/v1/system/status` | `view_system_status` |
| GET | `/api/v1/admin/logs` | `view_logs` | 