# CipherPay Relayer API Reference

This document provides a comprehensive reference for the CipherPay Relayer API.

## Core Classes

### Relayer

The main class for handling shielded transaction submission and management.

```typescript
class Relayer {
  constructor(config: RelayerConfig);
  
  // Transaction Management
  submitTransaction(shieldedTx: ShieldedTransaction): Promise<RelayerResponse>;
  getTransactionStatus(txHash: string): Promise<TransactionMetadata>;
}
```

### Configuration

```typescript
interface RelayerConfig {
  solanaRpcUrl: string;
  relayerPrivateKey: string;
  programId: PublicKey;
  maxGasPrice: number;
  minGasPrice: number;
  maxRetries: number;
  retryDelay: number;
}

interface ShieldedTransaction {
  commitment: string;
  nullifier: string;
  merkleRoot: string;
  zkProof: string;
  encryptedNote: string;
  senderEphemeralPubKey: string;
}

interface RelayerResponse {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface TransactionMetadata {
  status: TransactionStatus;
  timestamp: number;
  retryCount: number;
  error?: string;
}

type TransactionStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';
```

## Services

### GasService

Handles gas estimation and management.

```typescript
class GasService {
  constructor(connection: Connection, config?: typeof DEFAULT_CONFIG);
  
  estimateGas(transaction: ShieldedTransaction): Promise<GasEstimate>;
  canCoverGas(estimate: GasEstimate): boolean;
}

interface GasEstimate {
  estimatedGas: number;
  gasPrice: number;
  totalCost: number;
}
```

### PrivacyService

Manages privacy measures and transaction mixing.

```typescript
class PrivacyService {
  constructor(config?: typeof PRIVACY_CONFIG);
  
  applyPrivacyMeasures(): Promise<void>;
  isMixingEnabled(): boolean;
  getPrivacyConfig(): typeof PRIVACY_CONFIG;
}
```

### NetworkService

Handles network communication and transaction broadcasting.

```typescript
class NetworkService {
  constructor(connection: Connection, config?: NetworkConfig);
  
  broadcastTransaction(transaction: Transaction): Promise<string>;
  getTransactionStatus(signature: string): Promise<any>;
  getAccountInfo(publicKey: PublicKey): Promise<any>;
}
```

## Utilities

### Validation

```typescript
function validateTransaction(transaction: ShieldedTransaction): boolean;
function validateProof(proof: string): boolean;
function validateCommitment(commitment: string): boolean;
```

### Cryptography

```typescript
function encryptTransaction(
  transaction: ShieldedTransaction,
  publicKey: Uint8Array
): Uint8Array;

function decryptTransaction(
  encryptedData: Uint8Array,
  privateKey: Uint8Array
): ShieldedTransaction;

function generateKeyPair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

function hashMessage(message: string): Uint8Array;
```

## Constants

```typescript
const DEFAULT_CONFIG = {
  solanaRpcUrl: string;
  maxGasPrice: number;
  minGasPrice: number;
  maxRetries: number;
  retryDelay: number;
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
};

const PRIVACY_CONFIG = {
  maxDelay: number;
  minDelay: number;
  mixingEnabled: boolean;
};

const ERROR_MESSAGES = {
  INVALID_PROOF: string;
  INSUFFICIENT_GAS: string;
  TRANSACTION_FAILED: string;
  INVALID_COMMITMENT: string;
  DUPLICATE_NULLIFIER: string;
  NETWORK_ERROR: string;
  RATE_LIMIT_EXCEEDED: string;
};
```

## Examples

### Basic Usage

```typescript
import { Relayer } from '../src/core/relayer';
import { PublicKey } from '@solana/web3.js';

// Initialize relayer
const relayer = new Relayer({
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  relayerPrivateKey: 'your_private_key',
  programId: new PublicKey('your_program_id')
});

// Submit shielded transaction
const result = await relayer.submitTransaction({
  commitment: "0x...",
  nullifier: "0x...",
  merkleRoot: "0x...",
  zkProof: "0x...",
  encryptedNote: "0x...",
  senderEphemeralPubKey: "0x..."
});

// Check transaction status
const status = await relayer.getTransactionStatus(result.txHash);
```

### Error Handling

```typescript
try {
  const result = await relayer.submitTransaction(shieldedTx);
  if (!result.success) {
    console.error(`Transaction failed: ${result.error}`);
  }
} catch (error) {
  console.error('Relayer error:', error);
}
```

### Privacy Configuration

```typescript
import { PrivacyService } from '../src/services/privacy';

const privacyService = new PrivacyService({
  maxDelay: 30000,
  minDelay: 5000,
  mixingEnabled: true
});

await privacyService.applyPrivacyMeasures();
```

## Best Practices

1. **Error Handling**
   - Always check the `success` flag in `RelayerResponse`
   - Handle network errors gracefully
   - Implement retry logic for failed transactions

2. **Privacy**
   - Enable transaction mixing for enhanced privacy
   - Use appropriate delay settings
   - Keep private keys secure

3. **Gas Management**
   - Monitor gas prices
   - Set appropriate gas limits
   - Handle insufficient gas scenarios

4. **Security**
   - Never expose private keys
   - Validate all inputs
   - Use encryption for sensitive data

## Support

For API-related issues:
- Check the [GitHub repository](https://github.com/cipherpay/relayer-solana)
- Join the [Discord community](https://discord.gg/cipherpay)
- Contact support at support@cipherpay.com
