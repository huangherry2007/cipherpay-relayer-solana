# CipherPay Relayer for Solana

A high-performance relayer service for CipherPay's privacy-preserving payment protocol on Solana. This service handles shielded transaction submission, gas abstraction, privacy protection, and comprehensive authentication/authorization with Groth16 zero-knowledge proof verification.

## Features

- 🔒 Shielded transaction submission
- ⚡ Gas abstraction and management
- 🕵️ Privacy protection with transaction mixing
- 🔄 Automatic retry mechanism
- 📊 Transaction status tracking
- 🔐 Cryptographic operations
- 🔐 **Comprehensive Authentication & Authorization**
- 🔒 **Groth16 Zero-Knowledge Proof Verification**
- 🛡️ **Role-based Access Control**
- 🔑 **JWT Token & API Key Authentication**

## 🔐 Authentication & Authorization System

The CipherPay Relayer implements a production-ready authentication and authorization system with multiple authentication methods and role-based access control.

### Authentication Methods

#### JWT Token Authentication
- Secure token-based authentication with 24-hour expiration
- Automatic token validation and refresh
- Role-based permissions and access control

#### API Key Authentication
- Alternative authentication for automated systems
- Prefixed with `cp_` for identification
- Can be deactivated by administrators

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

### Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Account Lockout**: 5 failed attempts = 15-minute lockout
- **Password Security**: Bcrypt with 12 rounds
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin settings

## 🔒 Groth16 Zero-Knowledge Proof Verification

The relayer uses **snarkjs** for real Groth16 zero-knowledge proof verification, ensuring cryptographic security for all shielded transactions.

### Proof Verification Flow

```
Client Request → API Endpoint → ProofVerifierFactory → Circuit-Specific Verifier → snarkjs.groth16.verify() → Result
```

### Supported Circuits

#### Core Circuits

#### Transfer Circuit (`verifier-transfer.json`)
- **Purpose**: Verifies private transfer proofs before relaying transactions
- **Verification**: Ensures transfer validity without revealing amounts or recipients
- **Inputs**: Input notes, output notes, recipient, amount, fee
- **Security**: Prevents invalid transfers from being relayed
- **Groth16**: Real cryptographic verification using snarkjs

#### Merkle Circuit (`verifier-merkle.json`)
- **Purpose**: Verifies Merkle tree membership proofs for note commitments
- **Verification**: Ensures notes exist in the current state tree
- **Inputs**: Leaf commitment, Merkle path, root
- **Security**: Prevents double-spending and invalid note usage
- **Groth16**: Real cryptographic verification using snarkjs

#### Nullifier Circuit (`verifier-nullifier.json`)
- **Purpose**: Verifies nullifiers for spent notes
- **Verification**: Ensures notes haven't been spent before
- **Inputs**: Note commitment, secret
- **Security**: Prevents double-spending attacks
- **Groth16**: Real cryptographic verification using snarkjs

### Specialized Circuits

#### ZK Stream Circuit (`verifier-zkStream.json`)
- **Purpose**: Verifies streaming payment proofs
- **Verification**: Ensures stream conditions are met before relaying
- **Inputs**: Commitment, recipient, start/end times, current time, amount
- **Security**: Prevents premature or invalid stream releases
- **Groth16**: Real cryptographic verification using snarkjs

#### ZK Split Circuit (`verifier-zkSplit.json`)
- **Purpose**: Verifies payment splitting proofs
- **Verification**: Ensures split amounts are valid and complete
- **Inputs**: Input note, output notes, total amount
- **Security**: Prevents partial or invalid splits
- **Groth16**: Real cryptographic verification using snarkjs

#### ZK Condition Circuit (`verifier-zkCondition.json`)
- **Purpose**: Verifies conditional payment proofs
- **Verification**: Ensures conditions are met before relaying payments
- **Inputs**: Commitment, condition type, condition data, recipient, amount
- **Security**: Prevents invalid conditional payments
- **Groth16**: Real cryptographic verification using snarkjs

### Utility Circuits

#### Audit Proof Circuit (`verifier-audit_proof.json`)
- **Purpose**: Verifies audit proofs for compliance
- **Verification**: Ensures audit requirements are met
- **Inputs**: Notes, view key, total amount, timestamp
- **Security**: Maintains compliance while preserving privacy
- **Groth16**: Real cryptographic verification using snarkjs

#### Withdraw Circuit (`verifier-withdraw.json`)
- **Purpose**: Verifies withdrawal proofs
- **Verification**: Ensures withdrawal validity before relaying
- **Inputs**: Input notes, recipient, amount, fee
- **Security**: Prevents invalid withdrawals
- **Groth16**: Real cryptographic verification using snarkjs

### Circuit Integration

The relayer integrates circuits for proof verification before processing transactions:

```typescript
import { ProofVerifierFactory } from '@cipherpay/relayer-solana';

// Initialize circuit verifiers
const transferVerifier = ProofVerifierFactory.createVerifier('transfer');
const merkleVerifier = ProofVerifierFactory.createVerifier('merkle');
const nullifierVerifier = ProofVerifierFactory.createVerifier('nullifier');

// Verify transfer proof before relaying
async function verifyAndRelayTransfer(transaction, proof) {
  // Verify the zero-knowledge proof using Groth16
  const isValid = await transferVerifier.verifyProof({
    proof: {
      pi_a: proof.a,
      pi_b: proof.b,
      pi_c: proof.c
    },
    publicSignals: [
      transaction.commitment,
      transaction.nullifier,
      transaction.merkleRoot
    ]
  });
  
  if (!isValid) {
    throw new Error('Invalid Groth16 proof');
  }
  
  // Relay the transaction
  return await relayer.submitTransaction(transaction);
}
```

### Circuit Files Location

Circuit verification keys are stored in `src/zk/circuits/`:
- `verifier-transfer.json`
- `verifier-merkle.json`
- `verifier-nullifier.json`
- `verifier-zkStream.json`
- `verifier-zkSplit.json`
- `verifier-zkCondition.json`
- `verifier-audit_proof.json`
- `verifier-withdraw.json`

## Prerequisites

- Node.js >= 16.0.0
- Solana CLI tools
- TypeScript >= 4.5.0

## Installation

```bash
# Clone the repository
git clone https://github.com/cipherpay/relayer-solana.git
cd cipherpay-relayer-solana

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory:

```env
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
RELAYER_PRIVATE_KEY=your_private_key
CIPHERPAY_PROGRAM_ID=your_program_id
RELAYER_PROGRAM_ID=your_relayer_program_id

# Authentication Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000

# CORS Configuration
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Usage

### Authentication

```typescript
import axios from 'axios';

// Login to get JWT token
const loginResponse = await axios.post('http://localhost:3000/api/v1/auth/login', {
  email: 'user@example.com',
  password: 'password123'
});

const token = loginResponse.data.data.token;
```

### Submit Shielded Transaction

```typescript
import { Relayer } from './src/core/relayer';

const relayer = new Relayer({
  solanaRpcUrl: process.env.SOLANA_RPC_URL,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  programId: new PublicKey(process.env.CIPHERPAY_PROGRAM_ID)
});

// Submit a shielded transaction with Groth16 proof verification
const result = await relayer.submitTransaction({
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
}, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
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

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run Groth16 verification tests
npm run test:groth16

# Test specific circuit
node scripts/test-groth16.js --circuit transfer

# Lint code
npm run lint

# Format code
npm run format
```

## Testing

### Authentication Testing

```bash
# Test authentication flow
npm test -- --testNamePattern="Auth"

# Test permission validation
npm test -- --testNamePattern="Permissions"

# Test rate limiting
npm test -- --testNamePattern="RateLimit"
```

### Groth16 Verification Testing

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

## Architecture

The relayer service is built with a modular architecture:

- `src/core/`: Core relayer functionality
- `src/services/`: Supporting services (gas, privacy, network)
- `src/auth/`: Authentication and authorization system
- `src/utils/`: Utility functions
- `src/config/`: Configuration and types
- `src/zk/`: Zero-knowledge proof verification

For detailed architecture documentation, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## API Reference

For detailed API documentation, see [API.md](./docs/API.md).

## Security

- All transactions are encrypted
- Private keys are never exposed
- Gas abstraction protects user privacy
- Transaction mixing for enhanced privacy
- **JWT token security with 24-hour expiration**
- **API key authentication for automated systems**
- **Role-based access control**
- **Rate limiting and account lockout protection**
- **Groth16 cryptographic proof verification**
- **Comprehensive input validation**

## Production Deployment

### Security Checklist

- [ ] Change default passwords immediately
- [ ] Use strong JWT secrets
- [ ] Enable HTTPS
- [ ] Configure proper CORS settings
- [ ] Set up monitoring and alerting
- [ ] Use Redis for rate limiting (recommended)
- [ ] Implement audit logging
- [ ] Regular security updates

### Environment Variables

```bash
# Production JWT Secret (generate a strong one)
JWT_SECRET=your-very-long-and-random-secret-key-here

# Production CORS (restrict to your domains)
CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com

# Production Rate Limiting (adjust based on usage)
RATE_LIMIT_MAX_REQUESTS=1000
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please:
- Open an issue in the GitHub repository
- Join our [Discord community](https://discord.gg/cipherpay)
- Contact support at support@cipherpay.com

## Additional Documentation

- [Authentication Implementation Summary](./docs/AUTH_IMPLEMENTATION_SUMMARY.md)
- [Groth16 Integration Guide](./docs/GROTH16_INTEGRATION.md)
- [API Reference](./docs/API.md)
- [Architecture Documentation](./docs/ARCHITECTURE.md)
- [Security Best Practices](./docs/SECURITY.md)