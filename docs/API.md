# CipherPay Relayer API Reference

This document provides a comprehensive reference for the CipherPay Solana Relayer API, including Groth16 zero-knowledge proof verification and authentication/authorization systems.

## 🔐 Authentication & Authorization

The CipherPay Relayer implements a comprehensive authentication and authorization system with multiple authentication methods and role-based access control.

### Authentication Methods

#### 1. JWT Token Authentication
```typescript
// Login to get JWT token
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

// Use JWT token in Authorization header
Authorization: Bearer <jwt_token>
```

#### 2. API Key Authentication
```typescript
// Use API key in X-API-Key header
X-API-Key: cp_abc123def456ghi789
```

### User Roles & Permissions

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| **Admin** | Full system access | All permissions |
| **Operator** | Operational access | Submit transactions, verify proofs, view system status |
| **User** | Standard access | Submit transactions, verify proofs, view history |
| **Readonly** | Read-only access | View transactions, system status, fees |

### Default Users

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| `admin@cipherpay.com` | `admin123` | Admin | System administration |
| `operator@cipherpay.com` | `operator123` | Operator | Operational tasks |
| `readonly@cipherpay.com` | `readonly123` | Readonly | Monitoring and viewing |

## 🔒 Groth16 Zero-Knowledge Proof Verification

The relayer uses **snarkjs** for real Groth16 zero-knowledge proof verification, ensuring cryptographic security for all shielded transactions.

### Supported Circuits

#### Core Circuits
- **Transfer Circuit** (`verifier-transfer.json`): Private transfer verification
- **Merkle Circuit** (`verifier-merkle.json`): Merkle tree membership verification
- **Nullifier Circuit** (`verifier-nullifier.json`): Double-spend prevention

#### Specialized Circuits
- **ZK Stream Circuit** (`verifier-zkStream.json`): Streaming payment verification
- **ZK Split Circuit** (`verifier-zkSplit.json`): Payment splitting verification
- **ZK Condition Circuit** (`verifier-zkCondition.json`): Conditional payment verification

#### Utility Circuits
- **Audit Proof Circuit** (`verifier-audit_proof.json`): Compliance verification
- **Withdraw Circuit** (`verifier-withdraw.json`): Withdrawal verification

### Proof Verification Flow

```typescript
// Proof verification process
Client Request → API Endpoint → ProofVerifierFactory → Circuit-Specific Verifier → snarkjs.groth16.verify() → Result
```

### Groth16 Verification Example

```typescript
import { ProofVerifierFactory } from '../src/core/proof';

// Initialize verifier for transfer circuit
const verifier = ProofVerifierFactory.createVerifier('transfer');

// Verify Groth16 proof
const isValid = await verifier.verifyProof({
  proof: {
    pi_a: proof.a,
    pi_b: proof.b,
    pi_c: proof.c
  },
  publicSignals: [
    commitment,
    nullifier,
    merkleRoot
  ],
  verificationKey: verifierKey
});

if (!isValid) {
  throw new Error('Invalid Groth16 proof');
}
```

## 📡 API Endpoints

### Authentication Endpoints

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "role": "user",
      "permissions": ["submit_transaction", "verify_proof"]
    }
  }
}
```

#### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <jwt_token>
```

#### Change Password
```http
POST /api/v1/auth/change-password
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

#### Get Profile
```http
GET /api/v1/auth/profile
Authorization: Bearer <jwt_token>
```

### Transaction Endpoints

#### Submit Shielded Transaction
```http
POST /api/v1/submit-transaction
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "transactionData": {
    "commitment": "0xabc123...",
    "nullifier": "0xdeadbeef...",
    "merkleRoot": "0xmerkleRoot...",
    "encryptedNote": "0xencpayload..."
  },
  "proof": {
    "a": ["0x...", "0x..."],
    "b": [["0x...", "0x..."], ["0x...", "0x..."]],
    "c": ["0x...", "0x..."]
  },
  "circuitType": "transfer",
  "publicSignals": ["0xcommitment", "0xnullifier", "0xmerkleRoot"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "5J7X...",
    "status": "submitted",
    "timestamp": 1640995200000
  }
}
```

#### Get Transaction Status
```http
GET /api/v1/transaction/:txHash
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "5J7X...",
    "status": "confirmed",
    "timestamp": 1640995200000,
    "retryCount": 0,
    "error": null
  }
}
```

### Proof Verification Endpoints

#### Verify Proof
```http
POST /api/v1/verify-proof
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "circuitType": "transfer",
  "proof": {
    "a": ["0x...", "0x..."],
    "b": [["0x...", "0x..."], ["0x...", "0x..."]],
    "c": ["0x...", "0x..."]
  },
  "publicSignals": ["0xcommitment", "0xnullifier", "0xmerkleRoot"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "verificationTime": 15.2,
    "circuitType": "transfer"
  }
}
```

#### Get Supported Circuits
```http
GET /api/v1/circuits
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "circuits": [
      {
        "name": "transfer",
        "description": "Private transfer verification",
        "inputs": ["commitment", "nullifier", "merkleRoot"],
        "verificationKey": "verifier-transfer.json"
      },
      {
        "name": "merkle",
        "description": "Merkle tree membership verification",
        "inputs": ["leaf", "path", "root"],
        "verificationKey": "verifier-merkle.json"
      }
    ]
  }
}
```

### System Endpoints

#### Get System Status
```http
GET /api/v1/system/status
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "1.0.0",
    "circuits": {
      "transfer": "active",
      "merkle": "active",
      "nullifier": "active"
    },
    "relayer": {
      "balance": "10.5 SOL",
      "pendingTransactions": 5,
      "lastTransaction": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### Get System Metrics
```http
GET /api/v1/system/metrics
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": {
      "total": 1500,
      "successful": 1480,
      "failed": 20,
      "pending": 5
    },
    "proofs": {
      "verified": 1500,
      "invalid": 5,
      "averageVerificationTime": 12.5
    },
    "gas": {
      "totalSpent": "25.5 SOL",
      "averagePerTransaction": "0.017 SOL"
    }
  }
}
```

### Admin Endpoints

#### Create User (Admin Only)
```http
POST /api/v1/auth/users
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "username": "newuser",
  "password": "password123",
  "role": "user"
}
```

#### Get All Users (Admin Only)
```http
GET /api/v1/auth/users
Authorization: Bearer <jwt_token>
```

#### Generate API Key (Admin Only)
```http
POST /api/v1/auth/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "userId": "user-uuid",
  "description": "API key for automated system"
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000

# CORS
CORS_ORIGIN=*

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
RELAYER_PRIVATE_KEY=your_private_key
CIPHERPAY_PROGRAM_ID=your_program_id

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Rate Limiting

- **Authentication endpoints**: 5 requests per 15 minutes per IP
- **API endpoints**: 100 requests per 15 minutes per authenticated user
- **Admin endpoints**: 50 requests per 15 minutes per admin user

## 🛡️ Security Features

### Authentication Security
- **JWT Tokens**: 24-hour expiration with secure signing
- **API Keys**: Prefixed with `cp_` for identification
- **Password Security**: Bcrypt with 12 rounds
- **Account Lockout**: 5 failed attempts = 15-minute lockout

### Proof Verification Security
- **Groth16 Verification**: Real cryptographic verification using snarkjs
- **Circuit Validation**: All proofs verified against specific circuit constraints
- **Public Signal Validation**: Ensures proof inputs match expected format
- **Verification Key Integrity**: Secure storage and validation of verification keys

### Network Security
- **CORS Protection**: Configurable cross-origin settings
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Protection against abuse
- **Error Handling**: Secure error responses without information leakage

## 📊 Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  }
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_REQUIRED` | Authentication required | 401 |
| `INVALID_TOKEN` | Invalid or expired token | 401 |
| `INSUFFICIENT_PERMISSIONS` | Insufficient permissions | 403 |
| `INVALID_PROOF` | Invalid Groth16 proof | 400 |
| `INVALID_CIRCUIT` | Unsupported circuit type | 400 |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | 429 |
| `ACCOUNT_LOCKED` | Account temporarily locked | 423 |

## 🧪 Testing

### Run Groth16 Verification Tests

```bash
# Test all circuits
npm run test:groth16

# Test with verbose output
node scripts/test-groth16.js --verbose

# Test specific circuit
node scripts/test-groth16.js --circuit transfer

# Run all tests including Groth16 verification
npm test

# Run only Groth16 verification tests
npm test -- --testNamePattern="Groth16"
```

### Authentication Testing

```bash
# Test authentication flow
npm test -- --testNamePattern="Auth"

# Test permission validation
npm test -- --testNamePattern="Permissions"

# Test rate limiting
npm test -- --testNamePattern="RateLimit"
```

## 📚 Examples

### Complete Transaction Flow

```typescript
import axios from 'axios';

// 1. Login to get JWT token
const loginResponse = await axios.post('http://localhost:3000/api/v1/auth/login', {
  email: 'user@example.com',
  password: 'password123'
});

const token = loginResponse.data.data.token;

// 2. Submit shielded transaction with Groth16 proof
const transactionResponse = await axios.post(
  'http://localhost:3000/api/v1/submit-transaction',
  {
    transactionData: {
      commitment: "0xabc123...",
      nullifier: "0xdeadbeef...",
      merkleRoot: "0xmerkleRoot...",
      encryptedNote: "0xencpayload..."
    },
    proof: {
      a: ["0x...", "0x..."],
      b: [["0x...", "0x..."], ["0x...", "0x..."]],
      c: ["0x...", "0x..."]
    },
    circuitType: "transfer",
    publicSignals: ["0xcommitment", "0xnullifier", "0xmerkleRoot"]
  },
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);

// 3. Check transaction status
const statusResponse = await axios.get(
  `http://localhost:3000/api/v1/transaction/${transactionResponse.data.data.txHash}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
```

### API Key Authentication

```typescript
// Use API key instead of JWT token
const response = await axios.post(
  'http://localhost:3000/api/v1/submit-transaction',
  transactionData,
  {
    headers: {
      'X-API-Key': 'cp_abc123def456ghi789',
      'Content-Type': 'application/json'
    }
  }
);
```

### Proof Verification Only

```typescript
// Verify proof without submitting transaction
const verificationResponse = await axios.post(
  'http://localhost:3000/api/v1/verify-proof',
  {
    circuitType: "transfer",
    proof: proofData,
    publicSignals: publicSignals
  },
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);

if (verificationResponse.data.data.isValid) {
  console.log('Proof verified successfully');
} else {
  console.log('Proof verification failed');
}
```

## 🔗 Support

For API-related issues:
- Check the [GitHub repository](https://github.com/cipherpay/relayer-solana)
- Join the [Discord community](https://discord.gg/cipherpay)
- Contact support at support@cipherpay.com

## 📖 Additional Documentation

- [Authentication Implementation Summary](./AUTH_IMPLEMENTATION_SUMMARY.md)
- [Groth16 Integration Guide](./GROTH16_INTEGRATION.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [Security Best Practices](./SECURITY.md)
