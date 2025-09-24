// tests/api/submit-routes.test.ts
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { submitRouter } from '@/server/routes/submit.js';
import { mockProofVerifier, mockProofs } from '../mocks/proof-mocks.ts';
import { mockSolanaRelayer } from '../mocks/solana-mocks.ts';

// Mock the SolanaRelayer
jest.mock('@/services/solana-relayer.js', () => ({
  SolanaRelayer: jest.fn().mockImplementation(() => mockSolanaRelayer),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Submit Routes API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/submit', submitRouter(mockProofVerifier as any, mockSolanaRelayer as any));
    jest.clearAllMocks();
  });

  describe('POST /api/v1/submit/deposit', () => {
    it('should process a valid deposit request', async () => {
      mockProofVerifier.verify.mockResolvedValue(true as any);
      mockSolanaRelayer.processShieldedDeposit.mockResolvedValue('deposit-tx-123');

      const requestBody = {
        proof: mockProofs.deposit.proof,
        publicSignals: mockProofs.deposit.publicSignals,
        depositHash: 'a'.repeat(64),
        commitment: 'b'.repeat(64),
      };

      const response = await request(app)
        .post('/api/v1/submit/deposit')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        accepted: true,
        txSignature: 'deposit-tx-123',
        message: 'Deposit processed successfully',
      });

      expect(mockProofVerifier.verify).toHaveBeenCalledWith('deposit', requestBody.proof, requestBody.publicSignals);
      expect(mockSolanaRelayer.processShieldedDeposit).toHaveBeenCalledWith(
        Buffer.from(requestBody.depositHash, 'hex'),
        requestBody.proof,
        requestBody.publicSignals,
        Buffer.from(requestBody.commitment, 'hex')
      );
    });

    it('should handle invalid proof', async () => {
      mockProofVerifier.verify.mockRejectedValue(new Error('Invalid proof') as any);

      const requestBody = {
        proof: mockProofs.deposit.proof,
        publicSignals: mockProofs.deposit.publicSignals,
        depositHash: 'a'.repeat(64),
        commitment: 'b'.repeat(64),
      };

      const response = await request(app)
        .post('/api/v1/submit/deposit')
        .send(requestBody)
        .expect(400);

      expect(response.body.message).toContain('Invalid proof');
    });

    it('should handle missing required fields', async () => {
      const requestBody = {
        proof: mockProofs.deposit.proof,
        publicSignals: mockProofs.deposit.publicSignals,
        // Missing depositHash and commitment
      };

      await request(app)
        .post('/api/v1/submit/deposit')
        .send(requestBody)
        .expect(500);
    });
  });

  describe('POST /api/v1/submit/transfer', () => {
    it('should process a valid transfer request', async () => {
      mockProofVerifier.verify.mockResolvedValue(true as any);
      mockSolanaRelayer.processShieldedTransfer.mockResolvedValue('transfer-tx-456');

      const requestBody = {
        proof: mockProofs.transfer.proof,
        publicSignals: mockProofs.transfer.publicSignals,
        nullifier: 'c'.repeat(64),
        out1Commitment: 'd'.repeat(64),
        out2Commitment: 'e'.repeat(64),
      };

      const response = await request(app)
        .post('/api/v1/submit/transfer')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        accepted: true,
        txSignature: 'transfer-tx-456',
        message: 'Transfer processed successfully',
      });

      expect(mockProofVerifier.verify).toHaveBeenCalledWith('transfer', requestBody.proof, requestBody.publicSignals);
      expect(mockSolanaRelayer.processShieldedTransfer).toHaveBeenCalledWith(
        Buffer.from(requestBody.nullifier, 'hex'),
        requestBody.proof,
        requestBody.publicSignals,
        Buffer.from(requestBody.out1Commitment, 'hex'),
        Buffer.from(requestBody.out2Commitment, 'hex')
      );
    });
  });

  describe('POST /api/v1/submit/withdraw', () => {
    it('should process a valid withdraw request', async () => {
      mockProofVerifier.verify.mockResolvedValue(true as any);
      mockSolanaRelayer.processShieldedWithdraw.mockResolvedValue('withdraw-tx-789');

      const requestBody = {
        proof: mockProofs.withdraw.proof,
        publicSignals: mockProofs.withdraw.publicSignals,
        nullifier: 'f'.repeat(64),
        recipient: '11111111111111111111111111111111',
        amount: '1000000',
        mint: 'So11111111111111111111111111111111111111112',
      };

      const response = await request(app)
        .post('/api/v1/submit/withdraw')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        accepted: true,
        txSignature: 'withdraw-tx-789',
        message: 'Withdraw processed successfully',
      });

      expect(mockProofVerifier.verify).toHaveBeenCalledWith('withdraw', requestBody.proof, requestBody.publicSignals);
      expect(mockSolanaRelayer.processShieldedWithdraw).toHaveBeenCalledWith(
        Buffer.from(requestBody.nullifier, 'hex'),
        requestBody.proof,
        requestBody.publicSignals,
        expect.any(Object), // PublicKey
        BigInt(requestBody.amount),
        expect.any(Object) // PublicKey
      );
    });
  });

  describe('GET /api/v1/submit/status/:txSignature', () => {
    it('should get transaction status', async () => {
      const mockStatus = { status: 'confirmed', slot: 12345 };
      mockSolanaRelayer.getTransactionStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/v1/submit/status/test-signature-123')
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        status: mockStatus,
      });

      expect(mockSolanaRelayer.getTransactionStatus).toHaveBeenCalledWith('test-signature-123');
    });
  });

  describe('GET /api/v1/submit/merkle/root', () => {
    it('should get current Merkle root', async () => {
      const mockRoot = Buffer.from('current-root-32-bytes-long-123456789012', 'utf8');
      mockSolanaRelayer.getCurrentRoot.mockResolvedValue(mockRoot);

      const response = await request(app)
        .get('/api/v1/submit/merkle/root')
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        root: mockRoot.toString('hex'),
      });

      expect(mockSolanaRelayer.getCurrentRoot).toHaveBeenCalled();
    });
  });
});
