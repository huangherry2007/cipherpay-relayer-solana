import { validateTransaction, validateTransactionOrThrow, validateProof, validateProofOrThrow, validateCommitment, validateCommitmentOrThrow } from '../src/utils/validation';
import { ShieldedTransaction } from '../src/config/types';

describe('Transaction Validation', () => {
  describe('validateTransaction', () => {
    it('should validate a correct transaction', () => {
      const validTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };
      expect(validateTransaction(validTransaction)).toBe(true);
    });

    it('should reject transaction with invalid commitment', () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: 'invalid',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };
      expect(() => validateTransactionOrThrow(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid nullifier', () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: 'invalid',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };
      expect(() => validateTransactionOrThrow(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid merkleRoot', () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: 'invalid',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };
      expect(() => validateTransactionOrThrow(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid zkProof', () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: 'invalid',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };
      expect(() => validateTransactionOrThrow(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid encryptedNote', () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: 'invalid',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };
      expect(() => validateTransactionOrThrow(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid senderEphemeralPubKey', () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: 'invalid',
      };
      expect(() => validateTransactionOrThrow(invalidTransaction)).toThrow();
    });
  });

  describe('validateProof', () => {
    it('should validate a correct proof', () => {
      const validProof = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(validateProof(validProof)).toBe(true);
    });

    it('should reject proof without 0x prefix', () => {
      const invalidProof = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(() => validateProofOrThrow(invalidProof)).toThrow();
    });

    it('should reject proof with invalid hex characters', () => {
      const invalidProof = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefg';
      expect(() => validateProofOrThrow(invalidProof)).toThrow();
    });

    it('should reject proof with incorrect length', () => {
      const invalidProof = '0x1234567890abcdef';
      expect(() => validateProofOrThrow(invalidProof)).toThrow();
    });
  });

  describe('validateCommitment', () => {
    it('should validate a correct commitment', () => {
      const validCommitment = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(validateCommitment(validCommitment)).toBe(true);
    });

    it('should reject commitment without 0x prefix', () => {
      const invalidCommitment = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(() => validateCommitmentOrThrow(invalidCommitment)).toThrow();
    });

    it('should reject commitment with invalid hex characters', () => {
      const invalidCommitment = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefg';
      expect(() => validateCommitmentOrThrow(invalidCommitment)).toThrow();
    });

    it('should reject commitment with incorrect length', () => {
      const invalidCommitment = '0x1234567890abcdef';
      expect(() => validateCommitmentOrThrow(invalidCommitment)).toThrow();
    });
  });
});
