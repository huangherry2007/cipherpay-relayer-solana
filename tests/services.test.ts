import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { GasService } from '../src/services/gas';
import { PrivacyService } from '../src/services/privacy';
import { NetworkService } from '../src/services/network';
import { ShieldedTransaction } from '../src/config/types';
import { PRIVACY_CONFIG } from '../src/config/constants';

describe('Service Integration', () => {
  let connection: Connection;
  let gasService: GasService;
  let privacyService: PrivacyService;
  let networkService: NetworkService;

  beforeEach(() => {
    // Use local test validator URL for integration tests
    connection = new Connection('http://localhost:8899', 'confirmed');
    gasService = new GasService(connection);
    privacyService = new PrivacyService(PRIVACY_CONFIG);
    networkService = new NetworkService(connection);
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
      expect(gasEstimate).toBeGreaterThan(0);
    });

    it('should handle network errors during gas estimation', async () => {
      // Create an invalid connection to simulate network error
      const invalidConnection = new Connection('http://invalid-url');
      const invalidGasService = new GasService(invalidConnection);

      await expect(invalidGasService.estimateGas(mockTransaction)).rejects.toThrow();
    });
  });

  describe('PrivacyService Integration', () => {
    it('should apply privacy measures successfully', async () => {
      await expect(privacyService.applyPrivacyMeasures()).resolves.not.toThrow();
    });

    it('should apply random delay within configured range', async () => {
      const startTime = Date.now();
      await privacyService.applyPrivacyMeasures();
      const endTime = Date.now();
      const delay = endTime - startTime;

      expect(delay).toBeGreaterThanOrEqual(PRIVACY_CONFIG.minDelay);
      expect(delay).toBeLessThanOrEqual(PRIVACY_CONFIG.maxDelay);
    });

    it('should handle privacy configuration changes', async () => {
      // Test with different privacy configurations
      const customConfig = {
        ...PRIVACY_CONFIG,
        minDelay: 100,
        maxDelay: 200,
      };

      const customPrivacyService = new PrivacyService(customConfig);
      const startTime = Date.now();
      await customPrivacyService.applyPrivacyMeasures();
      const endTime = Date.now();
      const delay = endTime - startTime;

      expect(delay).toBeGreaterThanOrEqual(customConfig.minDelay);
      expect(delay).toBeLessThanOrEqual(customConfig.maxDelay);
    });
  });

  describe('NetworkService Integration', () => {
    it('should connect to the network successfully', async () => {
      const version = await connection.getVersion();
      expect(version).toBeDefined();
    });

    it('should get account info for a valid public key', async () => {
      const testAccount = Keypair.generate();
      const accountInfo = await networkService.getAccountInfo(testAccount.publicKey);
      expect(accountInfo).toBeDefined();
    });

    it('should handle invalid public key', async () => {
      const invalidPublicKey = new PublicKey('invalid');
      await expect(networkService.getAccountInfo(invalidPublicKey)).rejects.toThrow();
    });

    it('should get transaction status for a valid signature', async () => {
      // Note: This test requires a valid transaction signature
      // In a real test environment, you would first submit a transaction
      // and then check its status
      const mockSignature = 'mockSignature';
      await expect(networkService.getTransactionStatus(mockSignature)).rejects.toThrow();
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
      expect(gasEstimate).toBeGreaterThan(0);

      await privacyService.applyPrivacyMeasures();

      // Note: In a real test environment, you would submit a transaction
      // and verify its status through the network service
    });
  });
}); 