import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Relayer } from '../src/core/relayer';
import { TransactionManager, TransactionRequest } from '../src/core/transaction';
import { ProofVerifierFactory, ZKProof } from '../src/core/proof';
import { ShieldedTransaction } from '../src/config/types';
import { DEFAULT_CONFIG } from '../src/config/constants';

// Mock data for testing
const mockShieldedTransaction: ShieldedTransaction = {
  commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  merkleRoot: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
  zkProof: '0x1111111111111111111111111111111111111111111111111111111111111111',
  encryptedNote: '0x2222222222222222222222222222222222222222222222222222222222222222',
  senderEphemeralPubKey: '0x3333333333333333333333333333333333333333333333333333333333333333'
};

const mockProof: ZKProof = {
  a: ['0x1234567890abcdef', '0xfedcba0987654321'],
  b: [['0x1111111111111111', '0x2222222222222222'], ['0x3333333333333333', '0x4444444444444444']],
  c: ['0x5555555555555555', '0x6666666666666666'],
  publicInputs: ['0x7777777777777777', '0x8888888888888888', '0x9999999999999999', '0xaaaaaaaaaaaaaaaa']
};

describe('CipherPay Solana Relayer Integration Tests', () => {
  let connection: Connection;
  let keypair: Keypair;
  let programId: PublicKey;
  let relayer: Relayer;
  let transactionManager: TransactionManager;

  beforeAll(() => {
    // Initialize test environment
    connection = new Connection('http://localhost:8899', 'confirmed');
    keypair = Keypair.generate();
    programId = new PublicKey('11111111111111111111111111111111');
    
    relayer = new Relayer({
      solanaRpcUrl: 'http://localhost:8899',
      relayerPrivateKey: bs58.encode(keypair.secretKey),
      programId: programId,
      maxGasPrice: 1000000000,
      minGasPrice: 5000000,
      maxRetries: 3,
      retryDelay: 1000
    });

    transactionManager = new TransactionManager(connection, keypair, programId);
  });

  describe('Proof Verification', () => {
    test('should verify transfer proof', async () => {
      const isValid = await ProofVerifierFactory.verifyProof('transfer', mockProof);
      expect(isValid).toBe(true);
    });

    test('should verify merkle proof', async () => {
      const isValid = await ProofVerifierFactory.verifyProof('merkle', mockProof);
      expect(isValid).toBe(true);
    });

    test('should verify nullifier proof', async () => {
      const isValid = await ProofVerifierFactory.verifyProof('nullifier', mockProof);
      expect(isValid).toBe(true);
    });

    test('should handle invalid circuit type', async () => {
      await expect(
        ProofVerifierFactory.verifyProof('invalid' as any, mockProof)
      ).rejects.toThrow('Unknown circuit type: invalid');
    });
  });

  describe('Transaction Management', () => {
    test('should create transaction request', () => {
      const request: TransactionRequest = {
        shieldedTx: mockShieldedTransaction,
        circuitType: 'transfer',
        proof: mockProof
      };

      expect(request.shieldedTx).toBe(mockShieldedTransaction);
      expect(request.circuitType).toBe('transfer');
      expect(request.proof).toBe(mockProof);
    });

    test('should estimate transaction fee', async () => {
      const request: TransactionRequest = {
        shieldedTx: mockShieldedTransaction,
        circuitType: 'transfer',
        proof: mockProof
      };

      const fee = await transactionManager.estimateTransactionFee(request);
      expect(fee).toBeGreaterThan(0);
    });

    test('should estimate different fees for different circuit types', async () => {
      const transferRequest: TransactionRequest = {
        shieldedTx: mockShieldedTransaction,
        circuitType: 'transfer',
        proof: mockProof
      };

      const withdrawRequest: TransactionRequest = {
        shieldedTx: mockShieldedTransaction,
        circuitType: 'withdraw',
        proof: mockProof
      };

      const transferFee = await transactionManager.estimateTransactionFee(transferRequest);
      const withdrawFee = await transactionManager.estimateTransactionFee(withdrawRequest);

      expect(withdrawFee).toBeGreaterThan(transferFee);
    });
  });

  describe('Relayer Integration', () => {
    test('should submit transaction with proof', async () => {
      const result = await relayer.submitTransactionWithProof(
        mockShieldedTransaction,
        'transfer',
        mockProof
      );

      expect(result.success).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    test('should estimate transaction fee', async () => {
      const fee = await relayer.estimateTransactionFee(mockShieldedTransaction, 'transfer');
      expect(fee).toBeGreaterThan(0);
    });

    test('should verify proof through relayer', async () => {
      const isValid = await relayer.verifyProof('transfer', mockProof);
      expect(isValid).toBe(true);
    });

    test('should get relayer configuration', () => {
      expect(relayer.getConnection()).toBeDefined();
      expect(relayer.getKeypair()).toBeDefined();
      expect(relayer.getProgramId()).toBeDefined();
      expect(relayer.isPrivacyEnabled()).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid transaction format', async () => {
      const invalidTransaction: ShieldedTransaction = {
        commitment: 'invalid',
        nullifier: 'invalid',
        merkleRoot: 'invalid',
        zkProof: 'invalid',
        encryptedNote: 'invalid',
        senderEphemeralPubKey: 'invalid'
      };

      const result = await relayer.submitTransaction(invalidTransaction);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle network errors gracefully', async () => {
      const invalidConnection = new Connection('http://invalid-url:8899');
      const invalidRelayer = new Relayer({
        solanaRpcUrl: 'http://invalid-url:8899',
        relayerPrivateKey: bs58.encode(keypair.secretKey),
        programId: programId
      });

      const result = await invalidRelayer.submitTransaction(mockShieldedTransaction);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Privacy Features', () => {
    test('should have privacy configuration', () => {
      const privacyConfig = relayer.getPrivacyConfig();
      expect(privacyConfig).toBeDefined();
      expect(privacyConfig.mixingEnabled).toBeDefined();
      expect(privacyConfig.maxDelay).toBeDefined();
      expect(privacyConfig.minDelay).toBeDefined();
    });

    test('should check privacy status', () => {
      const isEnabled = relayer.isPrivacyEnabled();
      expect(typeof isEnabled).toBe('boolean');
    });
  });

  describe('Circuit Support', () => {
    test('should support all circuit types', () => {
      const supportedCircuits = [
        'transfer', 'merkle', 'nullifier', 'stream', 
        'split', 'condition', 'audit', 'withdraw'
      ];

      supportedCircuits.forEach(circuitType => {
        expect(() => {
          ProofVerifierFactory.getVerifier(circuitType);
        }).not.toThrow();
      });
    });
  });
});

// Helper function to encode base58
function bs58encode(buffer: Uint8Array): string {
  // This is a simplified implementation for testing
  return Buffer.from(buffer).toString('base64');
} 