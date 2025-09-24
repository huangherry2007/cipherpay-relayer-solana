// tests/integration/solana-relayer.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PublicKey, Keypair } from '@solana/web3.js';
import { SolanaRelayer } from '@/services/solana-relayer.js';
import { mockSolanaProgram, mockTxManager, mockEventWatcher } from '../mocks/solana-mocks.js';
import { mockCanonicalTree, mockTreeResponses } from '../mocks/merkle-mocks.js';
import { mockProofVerifier, mockProofs } from '../mocks/proof-mocks.js';

// Mock dependencies
jest.mock('@/solana/program.js', () => ({
  SolanaProgram: {
    create: jest.fn().mockResolvedValue(mockSolanaProgram) as any,
  },
}));

jest.mock('@/solana/tx-manager.js', () => ({
  TxManager: jest.fn().mockImplementation(() => mockTxManager),
}));

jest.mock('@/solana/event-watcher.js', () => ({
  EventWatcher: jest.fn().mockImplementation(() => mockEventWatcher),
}));

jest.mock('@/services/merkle/canonical-tree.js', () => ({
  CanonicalTree: mockCanonicalTree,
}));

jest.mock('@/zk/proof-verifier.js', () => ({
  ProofVerifier: jest.fn().mockImplementation(() => mockProofVerifier),
}));

describe('SolanaRelayer Integration', () => {
  let relayer: SolanaRelayer;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Setup mock responses
    mockTreeResponses.appendResult = {
      index: 5,
      root: Buffer.from('new-root-32-bytes-long-123456789012', 'utf8'),
    };
    
    mockTxManager.submitShieldedDepositAtomic.mockResolvedValue('deposit-tx-123' as any);
    mockTxManager.callShieldedTransfer.mockResolvedValue('transfer-tx-456' as any);
    mockTxManager.callShieldedWithdraw.mockResolvedValue('withdraw-tx-789' as any);
    mockProofVerifier.verify.mockResolvedValue(true as any);

    relayer = await SolanaRelayer.create(
      {
        solanaRpcUrl: 'https://api.devnet.solana.com',
        programId: '9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o',
        vkeyDir: './test-vkeys',
      },
      mockProofVerifier as any,
      mockCanonicalTree as any
    );
  });

  describe('processShieldedDeposit', () => {
    it('should process a complete shielded deposit flow', async () => {
      const depositHash = Buffer.from('deposit-hash-32-bytes-long-123456789012', 'utf8');
      const commitment = Buffer.from('commitment-32-bytes-long-123456789012', 'utf8');
      const proof = mockProofs.deposit.proof;
      const publicSignals = mockProofs.deposit.publicSignals;

      const result = await relayer.processShieldedDeposit(
        depositHash,
        proof,
        publicSignals,
        commitment
      );

      expect(result).toBe('deposit-tx-123');
      expect(mockProofVerifier.verify).toHaveBeenCalledWith('deposit', proof, publicSignals);
      expect(mockCanonicalTree.append).toHaveBeenCalled();
      expect(mockTxManager.submitShieldedDepositAtomic).toHaveBeenCalledWith({
        depositHash,
        proofBytes: Buffer.from(JSON.stringify(proof)),
        publicInputsBytes: Buffer.from(JSON.stringify(publicSignals)),
      });
    });

    it('should handle proof verification failure', async () => {
      mockProofVerifier.verify.mockRejectedValue(new Error('Invalid proof') as any);

      const depositHash = Buffer.from('deposit-hash-32-bytes-long-123456789012', 'utf8');
      const commitment = Buffer.from('commitment-32-bytes-long-123456789012', 'utf8');
      const proof = mockProofs.deposit.proof;
      const publicSignals = mockProofs.deposit.publicSignals;

      await expect(relayer.processShieldedDeposit(
        depositHash,
        proof,
        publicSignals,
        commitment
      )).rejects.toThrow('Failed to process shielded deposit: Invalid proof');
    });

    it('should handle Solana transaction failure', async () => {
      mockTxManager.submitShieldedDepositAtomic.mockRejectedValue(new Error('Transaction failed') as any);

      const depositHash = Buffer.from('deposit-hash-32-bytes-long-123456789012', 'utf8');
      const commitment = Buffer.from('commitment-32-bytes-long-123456789012', 'utf8');
      const proof = mockProofs.deposit.proof;
      const publicSignals = mockProofs.deposit.publicSignals;

      await expect(relayer.processShieldedDeposit(
        depositHash,
        proof,
        publicSignals,
        commitment
      )).rejects.toThrow('Failed to process shielded deposit: Transaction failed');
    });
  });

  describe('processShieldedTransfer', () => {
    it('should process a complete shielded transfer flow', async () => {
      const nullifier = Buffer.from('nullifier-32-bytes-long-123456789012', 'utf8');
      const out1Commitment = Buffer.from('out1-commitment-32-bytes-long-123456789012', 'utf8');
      const out2Commitment = Buffer.from('out2-commitment-32-bytes-long-123456789012', 'utf8');
      const proof = mockProofs.transfer.proof;
      const publicSignals = mockProofs.transfer.publicSignals;

      const result = await relayer.processShieldedTransfer(
        nullifier,
        proof,
        publicSignals,
        out1Commitment,
        out2Commitment
      );

      expect(result).toBe('transfer-tx-456');
      expect(mockProofVerifier.verify).toHaveBeenCalledWith('transfer', proof, publicSignals);
      expect(mockCanonicalTree.append).toHaveBeenCalledTimes(2);
      expect(mockTxManager.callShieldedTransfer).toHaveBeenCalledWith({
        nullifier,
        proofBytes: Buffer.from(JSON.stringify(proof)),
        publicInputsBytes: Buffer.from(JSON.stringify(publicSignals)),
      });
    });
  });

  describe('processShieldedWithdraw', () => {
    it('should process a complete shielded withdraw flow', async () => {
      const nullifier = Buffer.from('nullifier-32-bytes-long-123456789012', 'utf8');
      const recipient = Keypair.generate().publicKey;
      const mint = Keypair.generate().publicKey;
      const amount = BigInt(1000000);
      const proof = mockProofs.withdraw.proof;
      const publicSignals = mockProofs.withdraw.publicSignals;

      const result = await relayer.processShieldedWithdraw(
        nullifier,
        proof,
        publicSignals,
        recipient,
        amount,
        mint
      );

      expect(result).toBe('withdraw-tx-789');
      expect(mockProofVerifier.verify).toHaveBeenCalledWith('withdraw', proof, publicSignals);
      expect(mockTxManager.callShieldedWithdraw).toHaveBeenCalledWith({
        nullifier,
        proofBytes: Buffer.from(JSON.stringify(proof)),
        publicInputsBytes: Buffer.from(JSON.stringify(publicSignals)),
        recipient,
        amount,
        mint,
      });
    });
  });

  describe('event listening', () => {
    it('should start event listening', () => {
      const mockCallback = jest.fn();
      
      relayer.startEventListening(mockCallback);

      expect(mockEventWatcher.onAll).toHaveBeenCalledWith(mockCallback);
    });

    it('should stop event listening', () => {
      relayer.stopEventListening();

      expect(mockEventWatcher.stop).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should get transaction status', async () => {
      const mockStatus = { status: 'confirmed' };
      mockTxManager.getTransactionStatus.mockResolvedValue(mockStatus as any);

      const result = await relayer.getTransactionStatus('test-signature');

      expect(result).toBe(mockStatus);
      expect(mockTxManager.getTransactionStatus).toHaveBeenCalledWith('test-signature');
    });

    it('should get current Merkle root', async () => {
      const mockRoot = Buffer.from('current-root-32-bytes-long-123456789012', 'utf8');
      mockCanonicalTree.getRoot.mockResolvedValue({ root: mockRoot, nextIndex: 5 } as any);

      const result = await relayer.getCurrentRoot();

      expect(result).toBe(mockRoot);
      expect(mockCanonicalTree.getRoot).toHaveBeenCalled();
    });
  });
});
