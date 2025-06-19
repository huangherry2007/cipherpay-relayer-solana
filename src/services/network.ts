import { Connection, PublicKey, Transaction, TransactionSignature, VersionedTransaction } from '@solana/web3.js';
import { NetworkConfig, TransactionStatus, TransactionMetadata } from '../config/types';
import { DEFAULT_CONFIG, ERROR_MESSAGES } from '../config/constants';

export class NetworkService {
  private connection: Connection;
  private config: NetworkConfig;
  private transactionMap: Map<string, TransactionMetadata>;

  constructor(connection: Connection, config: NetworkConfig = DEFAULT_CONFIG) {
    this.connection = connection;
    this.config = config;
    this.transactionMap = new Map();
  }

  async broadcastTransaction(transaction: Transaction | VersionedTransaction): Promise<string> {
    try {
      const rawTransaction = transaction.serialize();
      const signature = await this.connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: this.config.maxRetries
      });
      
      // Initialize transaction metadata
      this.transactionMap.set(signature, {
        status: 'submitted',
        timestamp: Date.now(),
        retryCount: 0
      });

      // Start monitoring the transaction
      this.monitorTransaction(signature);
      
      return signature;
    } catch (error) {
      throw new Error(`Failed to broadcast transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async monitorTransaction(signature: TransactionSignature): Promise<void> {
    try {
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        this.updateTransactionStatus(signature, 'failed', confirmation.value.err.toString());
        return;
      }

      this.updateTransactionStatus(signature, 'confirmed');
    } catch (error) {
      this.handleTransactionError(signature, error);
    }
  }

  private updateTransactionStatus(
    signature: string,
    status: TransactionStatus,
    error?: string
  ): void {
    const metadata = this.transactionMap.get(signature);
    if (metadata) {
      metadata.status = status;
      if (error) {
        metadata.error = error;
      }
      this.transactionMap.set(signature, metadata);
    }
  }

  private async handleTransactionError(signature: string, error: unknown): Promise<void> {
    const metadata = this.transactionMap.get(signature);
    if (!metadata) return;

    metadata.retryCount++;
    
    if (metadata.retryCount >= this.config.maxRetries) {
      this.updateTransactionStatus(signature, 'failed', error instanceof Error ? error.message : 'Unknown error');
      return;
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
    
    // Retry monitoring
    this.monitorTransaction(signature);
  }

  async getTransactionStatus(signature: string): Promise<TransactionMetadata | null> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      if (!status.value) {
        return null;
      }

      const metadata = this.transactionMap.get(signature);
      if (metadata) {
        metadata.status = status.value.confirmationStatus as TransactionStatus;
        this.transactionMap.set(signature, metadata);
      }

      return metadata || null;
    } catch (error) {
      throw new Error(`Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAccountInfo(publicKey: PublicKey): Promise<any> {
    try {
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      if (!accountInfo) {
        throw new Error('Account not found');
      }
      return accountInfo;
    } catch (error) {
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRecentBlockhash(): Promise<string> {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash();
      return blockhash;
    } catch (error) {
      throw new Error(`Failed to get recent blockhash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getNetworkConfig(): NetworkConfig {
    return { ...this.config };
  }

  getTransactionMetadata(signature: string): TransactionMetadata | undefined {
    return this.transactionMap.get(signature);
  }
}
