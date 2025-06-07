import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Relayer } from '../src/core/relayer';
import { GasService } from '../src/services/gas';
import { PrivacyService } from '../src/services/privacy';
import { NetworkService } from '../src/services/network';
import { RelayerConfig, ShieldedTransaction, RelayerResponse } from '../src/config/types';
import { DEFAULT_CONFIG } from '../src/config/constants';

// Mock dependencies
jest.mock('@solana/web3.js');
jest.mock('../src/services/gas');
jest.mock('../src/services/privacy');
jest.mock('../src/services/network');

describe('Relayer', () => {
  let relayer: Relayer;
  let mockConnection: jest.Mocked<Connection>;
  let mockGasService: jest.Mocked<GasService>;
  let mockPrivacyService: jest.Mocked<PrivacyService>;
  let mockNetworkService: jest.Mocked<NetworkService>;
  let mockConfig: RelayerConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock config
    mockConfig = {
      ...DEFAULT_CONFIG,
      relayerPrivateKey: Buffer.from(Keypair.generate().secretKey).toString('hex'),
      programId: new PublicKey('11111111111111111111111111111111')
    };
    // Setup mock services
    mockGasService = new GasService(new Connection('test')) as jest.Mocked<GasService>;
    mockPrivacyService = new PrivacyService({
      maxDelay: 1000,
      minDelay: 100,
      mixingEnabled: false
    }) as jest.Mocked<PrivacyService>;
    mockNetworkService = new NetworkService(new Connection('test')) as jest.Mocked<NetworkService>;

    // Create relayer instance
    relayer = new Relayer(mockConfig);
  });

  describe('submitTransaction', () => {
    const mockTransaction: ShieldedTransaction = {
      commitment: '0x123',
      nullifier: '0x456',
      merkleRoot: '0x789',
      zkProof: '0xabc',
      encryptedNote: '0xdef',
      senderEphemeralPubKey: '0xghi',
    };

    it('should successfully submit a valid transaction', async () => {
      // Mock successful gas estimation
      mockGasService.estimateGas.mockResolvedValue({
        estimatedGas: 1000,
        gasPrice: 10,
        totalCost: 10000
      });

      // Mock successful privacy measures
      mockPrivacyService.applyPrivacyMeasures.mockResolvedValue();

      // Mock successful transaction broadcast
      const mockSignature = 'mockSignature';
      mockNetworkService.broadcastTransaction.mockResolvedValue(mockSignature);

      const result = await relayer.submitTransaction(mockTransaction);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(mockGasService.estimateGas).toHaveBeenCalledWith(mockTransaction);
      expect(mockPrivacyService.applyPrivacyMeasures).toHaveBeenCalled();
      expect(mockNetworkService.broadcastTransaction).toHaveBeenCalled();
    });

    it('should handle gas estimation failure', async () => {
      mockGasService.estimateGas.mockRejectedValue(new Error('Gas estimation failed'));

      await expect(relayer.submitTransaction(mockTransaction)).rejects.toThrow('Gas estimation failed');
      expect(mockPrivacyService.applyPrivacyMeasures).not.toHaveBeenCalled();
      expect(mockNetworkService.broadcastTransaction).not.toHaveBeenCalled();
    });
    it('should handle privacy measures failure', async () => {
      mockGasService.estimateGas.mockResolvedValue({
        estimatedGas: 1000,
        gasPrice: 10,
        totalCost: 10000
      });
      mockPrivacyService.applyPrivacyMeasures.mockRejectedValue(new Error('Privacy measures failed'));

      await expect(relayer.submitTransaction(mockTransaction)).rejects.toThrow('Privacy measures failed');
      expect(mockNetworkService.broadcastTransaction).not.toHaveBeenCalled();
    });
    it('should handle transaction broadcast failure', async () => {
      mockGasService.estimateGas.mockResolvedValue({
        estimatedGas: 1000,
        gasPrice: 10,
        totalCost: 10000
      });
      mockPrivacyService.applyPrivacyMeasures.mockResolvedValue();
      mockNetworkService.broadcastTransaction.mockRejectedValue(new Error('Broadcast failed'));

      await expect(relayer.submitTransaction(mockTransaction)).rejects.toThrow('Broadcast failed');
    });
  });

  describe('getTransactionStatus', () => {
    const mockSignature = 'mockSignature';

    it('should return transaction status when found', async () => {
      const mockStatus = { status: 'confirmed', slot: 123 };
      mockNetworkService.getTransactionStatus.mockResolvedValue(mockStatus);

      const result = await relayer.getTransactionStatus(mockSignature);

      expect(result).toEqual(mockStatus);
      expect(mockNetworkService.getTransactionStatus).toHaveBeenCalledWith(mockSignature);
    });

    it('should handle transaction not found', async () => {
      mockNetworkService.getTransactionStatus.mockRejectedValue(new Error('Transaction not found'));

      await expect(relayer.getTransactionStatus(mockSignature)).rejects.toThrow('Transaction not found');
    });
  });

  describe('getAccountInfo', () => {
    const mockPublicKey = new PublicKey('11111111111111111111111111111111');

    it('should return account info when found', async () => {
      const mockAccountInfo = { data: Buffer.from('test'), owner: mockPublicKey };
      mockNetworkService.getAccountInfo.mockResolvedValue(mockAccountInfo);

      const result = await relayer.getAccountInfo(mockPublicKey);

      expect(result).toEqual(mockAccountInfo);
      expect(mockNetworkService.getAccountInfo).toHaveBeenCalledWith(mockPublicKey);
    });

    it('should handle account not found', async () => {
      mockNetworkService.getAccountInfo.mockRejectedValue(new Error('Account not found'));

      await expect(relayer.getAccountInfo(mockPublicKey)).rejects.toThrow('Account not found');
    });
  });
});
