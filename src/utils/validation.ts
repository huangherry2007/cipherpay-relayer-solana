// src/utils/validation.ts
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';

// Common validation schemas
export const hexStringSchema = z.string().regex(/^[0-9a-fA-F]+$/, 'Must be a valid hex string');
export const buffer32Schema = z.string().length(64, 'Must be exactly 32 bytes (64 hex characters)');
export const publicKeySchema = z.string().refine(
  (val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  },
  'Must be a valid Solana public key'
);

// Proof validation schemas
export const groth16ProofSchema = z.object({
  pi_a: z.array(z.string()).length(3),
  pi_b: z.array(z.array(z.string())).length(3),
  pi_c: z.array(z.string()).length(3),
});

export const publicSignalsSchema = z.array(z.union([z.string(), z.number()])).transform((arr) => 
  arr.map(item => typeof item === 'number' ? item.toString() : item)
);

// Request validation schemas
export const depositRequestSchema = z.object({
  proof: groth16ProofSchema,
  publicSignals: publicSignalsSchema,
  depositHash: buffer32Schema,
  commitment: buffer32Schema,
});

export const transferRequestSchema = z.object({
  proof: groth16ProofSchema,
  publicSignals: publicSignalsSchema,
  nullifier: buffer32Schema,
  out1Commitment: buffer32Schema,
  out2Commitment: buffer32Schema,
});

export const withdrawRequestSchema = z.object({
  proof: groth16ProofSchema,
  publicSignals: publicSignalsSchema,
  nullifier: buffer32Schema,
  recipient: publicKeySchema,
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive integer'),
  mint: publicKeySchema,
});

// Validation functions
export function validateDepositRequest(data: unknown) {
  return depositRequestSchema.parse(data);
}

export function validateTransferRequest(data: unknown) {
  return transferRequestSchema.parse(data);
}

export function validateWithdrawRequest(data: unknown) {
  return withdrawRequestSchema.parse(data);
}

// Error handling utilities
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ProofVerificationError extends Error {
  constructor(message: string, public circuit?: string) {
    super(message);
    this.name = 'ProofVerificationError';
  }
}

export class SolanaTransactionError extends Error {
  constructor(message: string, public txSignature?: string) {
    super(message);
    this.name = 'SolanaTransactionError';
  }
}

export class MerkleTreeError extends Error {
  constructor(message: string, public operation?: string) {
    super(message);
    this.name = 'MerkleTreeError';
  }
}

// Error handler for API routes
export function handleApiError(error: unknown, req: any, res: any, next: any) {
  console.error('API Error:', error);

  if (error instanceof ValidationError) {
    return res.status(400).json({
      ok: false,
      error: 'ValidationError',
      message: error.message,
      field: error.field,
    });
  }

  if (error instanceof ProofVerificationError) {
    return res.status(400).json({
      ok: false,
      error: 'ProofVerificationError',
      message: error.message,
      circuit: error.circuit,
    });
  }

  if (error instanceof SolanaTransactionError) {
    return res.status(500).json({
      ok: false,
      error: 'SolanaTransactionError',
      message: error.message,
      txSignature: error.txSignature,
    });
  }

  if (error instanceof MerkleTreeError) {
    return res.status(500).json({
      ok: false,
      error: 'MerkleTreeError',
      message: error.message,
      operation: error.operation,
    });
  }

  // Generic error
  return res.status(500).json({
    ok: false,
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
}
