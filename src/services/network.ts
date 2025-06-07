import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { NetworkConfig } from '../config/types';
import { DEFAULT_CONFIG } from '../config/constants';

export class NetworkService {
  private connection: Connection;
  private config: NetworkConfig;

  constructor(connection: Connection, config: NetworkConfig = DEFAULT_CONFIG) {
    this.connection = connection;
    this.config = config;
  }

  async broadcastTransaction(transaction: Transaction): Promise<string> {
    try {
      const rawTransaction = transaction.serialize();
      const signature = await this.connection.sendRawTransaction(rawTransaction);
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature);
      
      return signature;
    } catch (error) {
      throw new Error(`Failed to broadcast transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTransactionStatus(signature: string): Promise<any> {
    try {
      return await this.connection.getSignatureStatus(signature);
    } catch (error) {
      throw new Error(`Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAccountInfo(publicKey: PublicKey): Promise<any> {
    try {
      return await this.connection.getAccountInfo(publicKey);
    } catch (error) {
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getNetworkConfig(): NetworkConfig {
    return { ...this.config };
  }
}
