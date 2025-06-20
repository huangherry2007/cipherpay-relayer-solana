# Groth16 Integration Guide

This document explains the integration of real Groth16 zero-knowledge proof verification in the CipherPay Solana Relayer.

## Overview

The relayer now uses **snarkjs** for actual Groth16 proof verification, replacing the placeholder implementation with real cryptographic verification. This ensures that all zero-knowledge proofs are cryptographically verified before transactions are processed.

## Architecture

### Proof Verification Flow

```
Client Request → API Endpoint → ProofVerifierFactory → Circuit-Specific Verifier → snarkjs.groth16.verify() → Result
```

### Components

1. **ProofVerifierFactory**: Factory class that manages different circuit verifiers
2. **Circuit-Specific Verifiers**: Individual verifiers for each circuit type
3. **snarkjs Integration**: Real Groth16 verification using snarkjs library
4. **Verification Keys**: JSON files containing the verification parameters for each circuit

## Supported Circuits

| Circuit | Verifier Class | Verification Key File | Purpose |
|---------|----------------|----------------------|---------|
| Transfer | `TransferProofVerifier` | `verifier-transfer.json` | Private transfers |
| Merkle | `MerkleProofVerifier` | `verifier-merkle.json` | Merkle tree membership |
| Nullifier | `NullifierProofVerifier` | `verifier-nullifier.json` | Spent note nullifiers |
| Stream | `ZKStreamProofVerifier` | `verifier-zkStream.json` | Time-based streaming |
| Split | `ZKSplitProofVerifier` | `verifier-zkSplit.json` | Payment splitting |
| Condition | `ZKConditionProofVerifier` | `verifier-zkCondition.json` | Conditional payments |
| Audit | `AuditProofVerifier` | `verifier-audit_proof.json` | Compliance audits |
| Withdraw | `WithdrawProofVerifier` | `verifier-withdraw.json` | Private to public withdrawals |

## Usage

### Basic Proof Verification

```typescript
import { ProofVerifierFactory, ZKProof } from '@cipherpay/relayer-solana';

const proof: ZKProof = {
  a: ['0x...', '0x...'],
  b: [['0x...', '0x...'], ['0x...', '0x...']],
  c: ['0x...', '0x...'],
  publicInputs: ['0x...', '0x...', '0x...', '0x...']
};

// Verify a transfer proof
const isValid = await ProofVerifierFactory.verifyProof('transfer', proof);
console.log('Proof is valid:', isValid);
```

### Detailed Verification with Timing

```typescript
const result = await ProofVerifierFactory.verifyProofWithDetails('transfer', proof);
console.log({
  isValid: result.isValid,
  verificationTime: result.verificationTime, // in milliseconds
  error: result.error
});
```

### API Endpoint Usage

```bash
# Verify a proof via API
curl -X POST http://localhost:3000/api/v1/verify-proof \
  -H "Content-Type: application/json" \
  -d '{
    "circuitType": "transfer",
    "proof": {
      "a": ["0x...", "0x..."],
      "b": [["0x...", "0x..."], ["0x...", "0x..."]],
      "c": ["0x...", "0x..."],
      "publicInputs": ["0x...", "0x...", "0x...", "0x..."]
    }
  }'
```

Response:
```json
{
  "success": true,
  "isValid": true,
  "verificationTime": 45,
  "circuitType": "transfer"
}
```

## Verification Key Management

### Key Structure

Each verification key file contains:

```json
{
  "protocol": "groth16",
  "curve": "bn128",
  "nPublic": 4,
  "vk_alpha_1": ["0x...", "0x..."],
  "vk_beta_2": [["0x...", "0x..."], ["0x...", "0x..."]],
  "vk_gamma_2": [["0x...", "0x..."], ["0x...", "0x..."]],
  "vk_delta_2": [["0x...", "0x..."], ["0x...", "0x..."]],
  "vk_alphabeta_12": [[["0x...", "0x..."], ["0x...", "0x..."]], [["0x...", "0x..."], ["0x...", "0x..."]]],
  "IC": [["0x...", "0x..."], ["0x...", "0x..."], ["0x...", "0x..."], ["0x...", "0x..."]]
}
```

### Key Loading

Verification keys are automatically loaded when verifiers are instantiated:

```typescript
// Keys are loaded from src/zk/circuits/
const verifier = new TransferProofVerifier();
// Automatically loads verifier-transfer.json
```

## Testing

### Run Groth16 Tests

```bash
# Test all circuits
npm run test:groth16

# Test with verbose output
node scripts/test-groth16.js --verbose

# Test specific circuit
node scripts/test-groth16.js --circuit transfer
```

### Jest Tests

```bash
# Run all tests including Groth16 verification
npm test

# Run only Groth16 verification tests
npm test -- --testNamePattern="Groth16"
```

### Test Coverage

```bash
# Generate coverage report
npm run test:coverage
```

## Performance Considerations

### Verification Times

Typical verification times for different circuits:

- **Transfer**: ~40-60ms
- **Merkle**: ~30-50ms
- **Nullifier**: ~20-40ms
- **Stream**: ~35-55ms
- **Split**: ~45-65ms
- **Condition**: ~40-60ms
- **Audit**: ~30-50ms
- **Withdraw**: ~50-70ms

### Optimization Tips

1. **Caching**: Verifiers are cached by the factory to avoid repeated key loading
2. **Concurrent Verification**: Multiple proofs can be verified concurrently
3. **Memory Management**: Verification keys are loaded once and reused

## Error Handling

### Common Errors

1. **Invalid Proof Format**: Proof components don't match expected structure
2. **Missing Verification Key**: Verification key file not found
3. **Invalid Public Signals**: Number of public signals doesn't match circuit requirements
4. **Cryptographic Verification Failed**: Proof fails mathematical verification

### Error Response Format

```typescript
{
  success: false,
  error: "Verification failed: Invalid proof format",
  verificationTime: 15
}
```

## Security Considerations

### Verification Key Security

- Verification keys are public and safe to distribute
- They contain no secret information
- They can be used to verify proofs but cannot generate them

### Proof Validation

- All proofs are cryptographically verified using snarkjs
- No shortcuts or placeholder validations
- Invalid proofs are rejected before transaction processing

### Input Validation

- Proof format is validated before cryptographic verification
- Public signals count is checked against circuit requirements
- Malformed inputs are rejected early

## Troubleshooting

### Common Issues

1. **"Cannot find module 'snarkjs'"**
   - Ensure snarkjs is installed: `npm install snarkjs`

2. **"Failed to load verification key"**
   - Check that verification key files exist in `src/zk/circuits/`
   - Verify file permissions

3. **"Invalid proof format"**
   - Ensure proof follows the ZKProof interface
   - Check that all required fields are present

4. **"Verification failed"**
   - Proof may be cryptographically invalid
   - Check that proof was generated with correct inputs
   - Verify that public signals match circuit requirements

### Debug Mode

Enable debug logging:

```typescript
// Set environment variable
process.env.DEBUG = 'cipherpay:groth16';

// Or enable in code
console.log('Verification details:', await ProofVerifierFactory.verifyProofWithDetails('transfer', proof));
```

## Integration with Other Services

### SDK Integration

The relayer's proof verification can be used by the CipherPay SDK:

```typescript
import { RelayerClient } from '@cipherpay/sdk';

const client = new RelayerClient('http://localhost:3000');
const result = await client.verifyProof('transfer', proof);
```

### Smart Contract Integration

Verification results can be used in Solana programs:

```rust
// In your Solana program
if proof_verification_result {
    // Process the transaction
    process_transaction();
} else {
    // Reject the transaction
    return Err(ErrorCode::InvalidProof);
}
```

## Future Enhancements

1. **Batch Verification**: Verify multiple proofs in a single call
2. **Proof Aggregation**: Combine multiple proofs into one
3. **Hardware Acceleration**: Use GPU/FPGA for faster verification
4. **Alternative Curves**: Support for different elliptic curves
5. **Proof Compression**: Reduce proof sizes for efficiency

## References

- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Groth16 Protocol](https://eprint.iacr.org/2016/260.pdf)
- [Circom Documentation](https://docs.circom.io/)
- [Zero-Knowledge Proofs](https://z.cash/technology/zksnarks/) 