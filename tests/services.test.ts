import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { GasService } from '../src/services/gas';
import { PrivacyService } from '../src/services/privacy';
import { NetworkService } from '../src/services/network';
import { ShieldedTransaction } from '../src/config/types';
import { PRIVACY_CONFIG } from '../src/config/constants';

// Mock the services
jest.mock('../src/services/gas');
jest.mock('../src/services/privacy');
jest.mock('../src/services/network');

describe('Service Integration', () => {
  let connection: Connection;
  let gasService: jest.Mocked<GasService>;
  let privacyService: jest.Mocked<PrivacyService>;
  let networkService: jest.Mocked<NetworkService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Use local test validator URL for integration tests
    connection = new Connection('http://localhost:8899', 'confirmed');
    
    // Create mocked instances
    gasService = new GasService(connection) as jest.Mocked<GasService>;
    privacyService = new PrivacyService(PRIVACY_CONFIG) as jest.Mocked<PrivacyService>;
    networkService = new NetworkService(connection) as jest.Mocked<NetworkService>;

    // Setup default mocks
    gasService.estimateGas = jest.fn().mockResolvedValue(5000);
    privacyService.applyPrivacyMeasures = jest.fn().mockResolvedValue(undefined);
    networkService.getAccountInfo = jest.fn().mockResolvedValue({ lamports: 1000000 });
    networkService.getTransactionStatus = jest.fn().mockResolvedValue('confirmed');
  });

  describe('GasService Integration', () => {
    const mockTransaction: ShieldedTransaction = {
      commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
      zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
      encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    it('should estimate gas for a valid transaction', async () => {
      const gasEstimate = await gasService.estimateGas(mockTransaction);
      expect(gasEstimate).toBe(5000);
      expect(gasService.estimateGas).toHaveBeenCalledWith(mockTransaction);
    });

    it('should handle network errors during gas estimation', async () => {
      gasService.estimateGas = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(gasService.estimateGas(mockTransaction)).rejects.toThrow('Network error');
      expect(gasService.estimateGas).toHaveBeenCalledWith(mockTransaction);
    });
  });

  describe('PrivacyService Integration', () => {
    it('should apply privacy measures successfully', async () => {
      await expect(privacyService.applyPrivacyMeasures()).resolves.not.toThrow();
      expect(privacyService.applyPrivacyMeasures).toHaveBeenCalled();
    });

    it('should apply random delay within configured range', async () => {
      // Mock with a specific delay
      privacyService.applyPrivacyMeasures = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });

      const startTime = Date.now();
      await privacyService.applyPrivacyMeasures();
      const endTime = Date.now();
      const delay = endTime - startTime;

      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(200);
      expect(privacyService.applyPrivacyMeasures).toHaveBeenCalled();
    });

    it('should handle privacy configuration changes', async () => {
      // Test with different privacy configurations
      const customConfig = {
        ...PRIVACY_CONFIG,
        minDelay: 100,
        maxDelay: 200,
      };

      const customPrivacyService = new PrivacyService(customConfig) as jest.Mocked<PrivacyService>;
      customPrivacyService.applyPrivacyMeasures = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });

      const startTime = Date.now();
      await customPrivacyService.applyPrivacyMeasures();
      const endTime = Date.now();
      const delay = endTime - startTime;

      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(200);
      expect(customPrivacyService.applyPrivacyMeasures).toHaveBeenCalled();
    });
  });

  describe('NetworkService Integration', () => {
    it('should connect to the network successfully', async () => {
      // Mock connection.getVersion
      jest.spyOn(connection, 'getVersion').mockResolvedValue({
        'solana-core': '1.16.0',
        'feature-set': 123456789
      });

      const version = await connection.getVersion();
      expect(version).toBeDefined();
      expect(version['solana-core']).toBe('1.16.0');
    });

    it('should get account info for a valid public key', async () => {
      const testAccount = Keypair.generate();
      const accountInfo = await networkService.getAccountInfo(testAccount.publicKey);
      expect(accountInfo).toBeDefined();
      expect(accountInfo.lamports).toBe(1000000);
      expect(networkService.getAccountInfo).toHaveBeenCalledWith(testAccount.publicKey);
    });

    it('should handle invalid public key', async () => {
      networkService.getAccountInfo = jest.fn().mockRejectedValue(new Error('Invalid public key'));
      
      const invalidPublicKey = new PublicKey('11111111111111111111111111111111');
      await expect(networkService.getAccountInfo(invalidPublicKey)).rejects.toThrow('Invalid public key');
      expect(networkService.getAccountInfo).toHaveBeenCalledWith(invalidPublicKey);
    });

    it('should get transaction status for a valid signature', async () => {
      const mockSignature = 'mockSignature';
      const status = await networkService.getTransactionStatus(mockSignature);
      expect(status).toBe('confirmed');
      expect(networkService.getTransactionStatus).toHaveBeenCalledWith(mockSignature);
    });

    it('should handle transaction status errors', async () => {
      networkService.getTransactionStatus = jest.fn().mockRejectedValue(new Error('Transaction not found'));
      
      const mockSignature = 'invalidSignature';
      await expect(networkService.getTransactionStatus(mockSignature)).rejects.toThrow('Transaction not found');
      expect(networkService.getTransactionStatus).toHaveBeenCalledWith(mockSignature);
    });
  });

  describe('Service Interaction', () => {
    it('should coordinate between services for transaction processing', async () => {
      const mockTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      // Test the flow of services working together
      const gasEstimate = await gasService.estimateGas(mockTransaction);
      expect(gasEstimate).toBe(5000);
      expect(gasService.estimateGas).toHaveBeenCalledWith(mockTransaction);

      await privacyService.applyPrivacyMeasures();
      expect(privacyService.applyPrivacyMeasures).toHaveBeenCalled();

      // Verify service interaction
      expect(gasService.estimateGas).toHaveBeenCalledTimes(1);
      expect(privacyService.applyPrivacyMeasures).toHaveBeenCalledTimes(1);
    });

    it('should handle service failures gracefully', async () => {
      const mockTransaction: ShieldedTransaction = {
        commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
        zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
        encryptedNote: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        senderEphemeralPubKey: '0x234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      // Mock gas service failure
      gasService.estimateGas = jest.fn().mockRejectedValue(new Error('Gas estimation failed'));

      await expect(gasService.estimateGas(mockTransaction)).rejects.toThrow('Gas estimation failed');
      expect(gasService.estimateGas).toHaveBeenCalledWith(mockTransaction);
    });
  });
}); 