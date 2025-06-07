import { ShieldedTransaction } from '../config/types';
import { ERROR_MESSAGES } from '../config/constants';

export function validateTransaction(transaction: ShieldedTransaction): boolean {
  try {
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

    return true;
  } catch (error) {
    console.error('Transaction validation failed:', error);
    return false;
  }
}

function isValidHex(str: string): boolean {
  // Check if string is a valid hex format
  return /^0x[0-9a-fA-F]+$/.test(str);
}

export function validateProof(proof: string): boolean {
  try {
    // Basic proof format validation
    if (!isValidHex(proof)) {
      throw new Error(ERROR_MESSAGES.INVALID_PROOF);
    }

    // Add more specific proof validation logic here
    // This could include:
    // 1. Checking proof length
    // 2. Validating proof structure
    // 3. Verifying proof format

    return true;
  } catch (error) {
    console.error('Proof validation failed:', error);
    return false;
  }
}

export function validateCommitment(commitment: string): boolean {
  try {
    // Basic commitment format validation
    if (!isValidHex(commitment)) {
      throw new Error(ERROR_MESSAGES.INVALID_COMMITMENT);
    }

    // Add more specific commitment validation logic here
    // This could include:
    // 1. Checking commitment length
    // 2. Validating commitment structure
    // 3. Verifying commitment format

    return true;
  } catch (error) {
    console.error('Commitment validation failed:', error);
    return false;
  }
}
