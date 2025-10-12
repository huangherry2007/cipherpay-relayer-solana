// tests/solana/tx-manager.test.ts
import { jest } from '@jest/globals';
import { PublicKey, Keypair } from '@solana/web3.js';
import { TxManager } from '@/solana/tx-manager.js';
import { mockSolanaProgram } from '../mocks/solana-mocks.ts';

// Mock the SolanaProgram
jest.mock('@/solana/program.js', () => ({
  SolanaProgram: jest.fn().mockImplementation(() => mockSolanaProgram),
}));

describe('TxManager', () => {
  let txManager: TxManager;
  let mockPayer: PublicKey;

  beforeEach(() => {
    mockPayer = Keypair.generate().publicKey;
    txManager = new TxManager(mockSolanaProgram as any, mockPayer);
    jest.clearAllMocks();
  });

  describe('submitShieldedDepositAtomic', () => {
    it('should submit a shielded deposit transaction', async () => {
      const mockTxSignature = 'mock-tx-signature-123';
      const mockMethods = {
        accountsPartial: jest.fn().mockReturnThis(),
        preInstructions: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockResolvedValue(mockTxSignature) as any,
      } as any;
      mockSolanaProgram.program.methods.shieldedDepositAtomic.mockReturnValue(mockMethods);

      const args = {
        depositHash: Buffer.from('deposit-hash-32-bytes-long-123456789012', 'utf8'),
        proofBytes: Buffer.from('proof-bytes'),
        publicInputsBytes: Buffer.from('public-inputs'),
        mint: new PublicKey('So11111111111111111111111111111111111111112'),
        vaultTokenAccount: new PublicKey('11111111111111111111111111111112'),
      };

      const result = await txManager.submitShieldedDepositAtomic(args);

      expect(result).toBe(mockTxSignature);
      expect(mockSolanaProgram.program.methods.shieldedDepositAtomic).toHaveBeenCalledWith(
        args.depositHash,
        args.proofBytes,
        args.publicInputsBytes
      );
      expect(mockMethods.accountsPartial).toHaveBeenCalled();
      expect(mockMethods.preInstructions).toHaveBeenCalled();
      expect(mockMethods.rpc).toHaveBeenCalled();
    });

    it('should handle errors during deposit submission', async () => {
      const mockError = new Error('Transaction failed');
      const mockMethods = {
        accountsPartial: jest.fn().mockReturnThis(),
        preInstructions: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockRejectedValue(mockError) as any,
      };
      mockSolanaProgram.program.methods.shieldedDepositAtomic.mockReturnValue(mockMethods);

      const args = {
        depositHash: Buffer.from('deposit-hash-32-bytes-long-123456789012', 'utf8'),
        proofBytes: Buffer.from('proof-bytes'),
        publicInputsBytes: Buffer.from('public-inputs'),
        mint: new PublicKey('So11111111111111111111111111111111111111112'),
        vaultTokenAccount: new PublicKey('11111111111111111111111111111112'),
      };

      await expect(txManager.submitShieldedDepositAtomic(args)).rejects.toThrow('Shielded deposit failed: Transaction failed');
    });
  });

  describe('callShieldedTransfer', () => {
    it('should submit a shielded transfer transaction', async () => {
      const mockTxSignature = 'mock-transfer-signature-456';
      const mockMethods = {
        accountsPartial: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockResolvedValue(mockTxSignature) as any,
      };
      mockSolanaProgram.program.methods.shieldedTransfer.mockReturnValue(mockMethods);

      const args = {
        nullifier: Buffer.from('nullifier-32-bytes-long-123456789012', 'utf8'),
        proofBytes: Buffer.from('transfer-proof-bytes'),
        publicInputsBytes: Buffer.from('transfer-public-inputs'),
      };

      const result = await txManager.callShieldedTransfer(args);

      expect(result).toBe(mockTxSignature);
      expect(mockSolanaProgram.program.methods.shieldedTransfer).toHaveBeenCalledWith(
        args.nullifier,
        args.proofBytes,
        args.publicInputsBytes
      );
      expect(mockMethods.accountsPartial).toHaveBeenCalled();
      expect(mockMethods.rpc).toHaveBeenCalled();
    });
  });

  describe('callShieldedWithdraw', () => {
    it('should submit a shielded withdraw transaction', async () => {
      const mockTxSignature = 'mock-withdraw-signature-789';
      const mockMethods = {
        accountsPartial: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockResolvedValue(mockTxSignature) as any,
      };
      mockSolanaProgram.program.methods.shieldedWithdraw.mockReturnValue(mockMethods);

      const recipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const args = {
        nullifier: Buffer.from('nullifier-32-bytes-long-123456789012', 'utf8'),
        proofBytes: Buffer.from('withdraw-proof-bytes'),
        publicInputsBytes: Buffer.from('withdraw-public-inputs'),
        recipient,
        amount: BigInt(1000),
        mint,
      };

      const result = await txManager.callShieldedWithdraw(args);

      expect(result).toBe(mockTxSignature);
      expect(mockSolanaProgram.program.methods.shieldedWithdraw).toHaveBeenCalledWith(
        args.nullifier,
        args.proofBytes,
        args.publicInputsBytes
      );
      expect(mockMethods.accountsPartial).toHaveBeenCalled();
      expect(mockMethods.rpc).toHaveBeenCalled();
    });
  });

  describe('getTransactionStatus', () => {
    it('should get transaction status', async () => {
      const mockStatus = { status: 'confirmed' };
      mockSolanaProgram.connection.getTransaction.mockResolvedValue(mockStatus as any);

      const signature = 'test-signature-123';
      const result = await txManager.getTransactionStatus(signature);

      expect(result).toBe(mockStatus);
      expect(mockSolanaProgram.connection.getTransaction).toHaveBeenCalledWith(signature);
    });
  });
});
