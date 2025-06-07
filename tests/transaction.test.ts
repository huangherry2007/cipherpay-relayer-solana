import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { validateTransaction, validateProof, validateCommitment } from '../src/utils/validation';
import { ShieldedTransaction } from '../src/config/types';

describe('Transaction Validation', () => {
  describe('validateTransaction', () => {
    const validTransaction: ShieldedTransaction = {
      commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
      zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
      encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    it('should validate a correct transaction', () => {
      expect(validateTransaction(validTransaction)).toBe(true);
    });

    it('should reject transaction with invalid commitment', () => {
      const invalidTransaction = {
        ...validTransaction,
        commitment: 'invalid',
      };
      expect(() => validateTransaction(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid nullifier', () => {
      const invalidTransaction = {
        ...validTransaction,
        nullifier: 'invalid',
      };
      expect(() => validateTransaction(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid merkleRoot', () => {
      const invalidTransaction = {
        ...validTransaction,
        merkleRoot: 'invalid',
      };
      expect(() => validateTransaction(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid zkProof', () => {
      const invalidTransaction = {
        ...validTransaction,
        zkProof: 'invalid',
      };
      expect(() => validateTransaction(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid encryptedNote', () => {
      const invalidTransaction = {
        ...validTransaction,
        encryptedNote: 'invalid',
      };
      expect(() => validateTransaction(invalidTransaction)).toThrow();
    });

    it('should reject transaction with invalid senderEphemeralPubKey', () => {
      const invalidTransaction = {
        ...validTransaction,
        senderEphemeralPubKey: 'invalid',
      };
      expect(() => validateTransaction(invalidTransaction)).toThrow();
    });
  });

  describe('validateProof', () => {
    it('should validate a correct proof', () => {
      const validProof = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(validateProof(validProof)).toBe(true);
    });

    it('should reject proof without 0x prefix', () => {
      const invalidProof = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(() => validateProof(invalidProof)).toThrow();
    });

    it('should reject proof with invalid hex characters', () => {
      const invalidProof = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefg';
      expect(() => validateProof(invalidProof)).toThrow();
    });

    it('should reject proof with incorrect length', () => {
      const invalidProof = '0x1234567890abcdef';
      expect(() => validateProof(invalidProof)).toThrow();
    });
  });

  describe('validateCommitment', () => {
    it('should validate a correct commitment', () => {
      const validCommitment = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(validateCommitment(validCommitment)).toBe(true);
    });

    it('should reject commitment without 0x prefix', () => {
      const invalidCommitment = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(() => validateCommitment(invalidCommitment)).toThrow();
    });

    it('should reject commitment with invalid hex characters', () => {
      const invalidCommitment = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefg';
      expect(() => validateCommitment(invalidCommitment)).toThrow();
    });

    it('should reject commitment with incorrect length', () => {
      const invalidCommitment = '0x1234567890abcdef';
      expect(() => validateCommitment(invalidCommitment)).toThrow();
    });
  });
});
