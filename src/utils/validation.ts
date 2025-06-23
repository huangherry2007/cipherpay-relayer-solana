import { ShieldedTransaction } from '../config/types';
import { ERROR_MESSAGES } from '../config/constants';

// Constants for validation
const HEX_LENGTH_32_BYTES = 66; // 0x + 64 hex characters

export function validateTransaction(transaction: ShieldedTransaction): boolean {
  try {
    validateTransactionOrThrow(transaction);
    return true;
  } catch (error) {
    console.error('Transaction validation failed:', error);
    return false;
  }
}

export function validateTransactionOrThrow(transaction: ShieldedTransaction): void {
  // Validate commitment format
  if (!isValidHex(transaction.commitment)) {
    throw new Error(ERROR_MESSAGES.INVALID_COMMITMENT);
  }

  // Validate nullifier format
  if (!isValidHex(transaction.nullifier)) {
    throw new Error('Invalid nullifier format');
  }

  // Validate merkle root format
  if (!isValidHex(transaction.merkleRoot)) {
    throw new Error('Invalid merkle root format');
  }

  // Validate zk-proof format
  if (!isValidHex(transaction.zkProof)) {
    throw new Error(ERROR_MESSAGES.INVALID_PROOF);
  }

  // Validate encrypted note format
  if (!isValidHex(transaction.encryptedNote)) {
    throw new Error('Invalid encrypted note format');
  }

  // Validate sender ephemeral public key
  if (!isValidHex(transaction.senderEphemeralPubKey)) {
    throw new Error('Invalid sender ephemeral public key format');
  }
}

function isValidHex(str: string): boolean {
  // Check if string is a valid hex format
  return /^0x[0-9a-fA-F]+$/.test(str);
}

export function validateProof(proof: string): boolean {
  try {
    validateProofOrThrow(proof);
    return true;
  } catch (error) {
    console.error('Proof validation failed:', error);
    return false;
  }
}

export function validateProofOrThrow(proof: string): void {
  // Basic proof format validation
  if (!isValidHex(proof)) {
    throw new Error(ERROR_MESSAGES.INVALID_PROOF);
  }

  // Check proof length (should be 32 bytes = 64 hex chars + 0x prefix)
  if (proof.length !== HEX_LENGTH_32_BYTES) {
    throw new Error(ERROR_MESSAGES.INVALID_PROOF);
  }

  // Add more specific proof validation logic here
  // This could include:
  // 1. Checking proof structure
  // 2. Verifying proof format
}

export function validateCommitment(commitment: string): boolean {
  try {
    validateCommitmentOrThrow(commitment);
    return true;
  } catch (error) {
    console.error('Commitment validation failed:', error);
    return false;
  }
}

export function validateCommitmentOrThrow(commitment: string): void {
  // Basic commitment format validation
  if (!isValidHex(commitment)) {
    throw new Error(ERROR_MESSAGES.INVALID_COMMITMENT);
  }

  // Check commitment length (should be 32 bytes = 64 hex chars + 0x prefix)
  if (commitment.length !== HEX_LENGTH_32_BYTES) {
    throw new Error(ERROR_MESSAGES.INVALID_COMMITMENT);
  }

  // Add more specific commitment validation logic here
  // This could include:
  // 1. Checking commitment structure
  // 2. Verifying commitment format
}
