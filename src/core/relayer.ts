import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { RelayerConfig, ShieldedTransaction, RelayerResponse, TransactionMetadata } from '../config/types';
import { DEFAULT_CONFIG, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../config/constants';
import { GasService } from '../services/gas';
import { PrivacyService } from '../services/privacy';
import { NetworkService } from '../services/network';
import { TransactionManager, TransactionRequest } from './transaction';
import { ProofVerifierFactory, ZKProof } from './proof';
import { validateTransaction } from '../utils/validation';
import { encryptTransaction } from '../utils/crypto';
import * as bs58 from 'bs58';

export class Relayer {
  private connection: Connection;
  private keypair: Keypair;
  private gasService: GasService;
  private privacyService: PrivacyService;
  private networkService: NetworkService;
  private transactionManager: TransactionManager;
  private config: RelayerConfig;

  constructor(config: Partial<RelayerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as RelayerConfig;
    this.connection = new Connection(this.config.solanaRpcUrl);
    this.keypair = Keypair.fromSecretKey(bs58.decode(this.config.relayerPrivateKey));
    this.gasService = new GasService(this.connection);
    this.privacyService = new PrivacyService();
    this.networkService = new NetworkService(this.connection);
    this.transactionManager = new TransactionManager(this.connection, this.keypair, this.config.programId);
  }

  async submitTransaction(
    shieldedTx: ShieldedTransaction,
    circuitType: string = 'transfer',
    proof?: ZKProof
  ): Promise<RelayerResponse> {
    try {
      // Validate the transaction
      if (!validateTransaction(shieldedTx)) {
        return {
          success: false,
          error: ERROR_MESSAGES.INVALID_PROOF
        };
      }

      // If no proof provided, create a mock proof for testing
      const mockProof: ZKProof = proof || {
        a: ['0x0', '0x0'],
        b: [['0x0', '0x0'], ['0x0', '0x0']],
        c: ['0x0', '0x0'],
        publicInputs: ['0x0', '0x0', '0x0', '0x0']
      };

      // Create transaction request
      const request: TransactionRequest = {
        shieldedTx,
        circuitType: circuitType as any,
        proof: mockProof
      };

      // Estimate gas and check if we can cover it
      const gasEstimate = await this.gasService.estimateGas(shieldedTx);
      if (!this.gasService.canCoverGas(gasEstimate)) {
        return {
          success: false,
          error: ERROR_MESSAGES.INSUFFICIENT_GAS
        };
      }

      // Apply privacy measures
      await this.privacyService.applyPrivacyMeasures();

      // Process transaction using transaction manager
      const result = await this.transactionManager.processTransaction(request);

      if (result.success) {
        return {
          success: true,
          txHash: result.txHash
        };
      } else {
        return {
          success: false,
          error: result.error || ERROR_MESSAGES.TRANSACTION_FAILED
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
      };
    }
  }

  async submitTransactionWithProof(
    shieldedTx: ShieldedTransaction,
    circuitType: string,
    proof: ZKProof
  ): Promise<RelayerResponse> {
    try {
      // Validate the transaction
      if (!validateTransaction(shieldedTx)) {
        return {
          success: false,
          error: ERROR_MESSAGES.INVALID_PROOF
        };
      }

      // Verify the proof
      const proofValid = await ProofVerifierFactory.verifyProof(circuitType, proof);
      if (!proofValid) {
        return {
          success: false,
          error: ERROR_MESSAGES.INVALID_PROOF
        };
      }

      // Create transaction request
      const request: TransactionRequest = {
        shieldedTx,
        circuitType: circuitType as any,
        proof
      };

      // Estimate gas and check if we can cover it
      const gasEstimate = await this.gasService.estimateGas(shieldedTx);
      if (!this.gasService.canCoverGas(gasEstimate)) {
        return {
          success: false,
          error: ERROR_MESSAGES.INSUFFICIENT_GAS
        };
      }

      // Apply privacy measures
      await this.privacyService.applyPrivacyMeasures();

      // Process transaction using transaction manager
      const result = await this.transactionManager.processTransaction(request);

      if (result.success) {
        return {
          success: true,
          txHash: result.txHash
        };
      } else {
        return {
          success: false,
          error: result.error || ERROR_MESSAGES.TRANSACTION_FAILED
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
      };
    }
  }

  async estimateTransactionFee(
    shieldedTx: ShieldedTransaction,
    circuitType: string = 'transfer'
  ): Promise<number> {
    try {
      const mockProof: ZKProof = {
        a: ['0x0', '0x0'],
        b: [['0x0', '0x0'], ['0x0', '0x0']],
        c: ['0x0', '0x0'],
        publicInputs: ['0x0', '0x0', '0x0', '0x0']
      };

      const request: TransactionRequest = {
        shieldedTx,
        circuitType: circuitType as any,
        proof: mockProof
      };

      return await this.transactionManager.estimateTransactionFee(request);
    } catch (error) {
      throw new Error(`Failed to estimate transaction fee: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTransactionStatus(txHash: string): Promise<TransactionMetadata> {
    try {
      return await this.transactionManager.getTransactionStatus(txHash);
    } catch (error) {
      return {
        status: 'failed',
        timestamp: Date.now(),
        retryCount: 0,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
      };
    }
  }

  async verifyProof(circuitType: string, proof: ZKProof): Promise<boolean> {
    try {
      return await ProofVerifierFactory.verifyProof(circuitType, proof);
    } catch (error) {
      console.error('Proof verification failed:', error);
      return false;
    }
  }

  getAccountInfo(publicKey: PublicKey) {
    return this.networkService.getAccountInfo(publicKey);
  }

  getConnection(): Connection {
    return this.connection;
  }

  getKeypair(): Keypair {
    return this.keypair;
  }

  getProgramId(): PublicKey {
    return this.config.programId;
  }

  isPrivacyEnabled(): boolean {
    return this.privacyService.isMixingEnabled();
  }

  getPrivacyConfig() {
    return this.privacyService.getPrivacyConfig();
  }
}
