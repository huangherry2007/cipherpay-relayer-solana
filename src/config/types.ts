import { PublicKey, Transaction } from '@solana/web3.js';

export interface RelayerConfig {
  solanaRpcUrl: string;
  relayerPrivateKey: string;
  programId: PublicKey;
  maxGasPrice: number;
  minGasPrice: number;
  maxRetries: number;
  retryDelay: number;
}

export interface ShieldedTransaction {
  commitment: string;
  nullifier: string;
  merkleRoot: string;
  zkProof: string;
  encryptedNote: string;
  senderEphemeralPubKey: string;
}

export interface RelayerResponse {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface GasEstimate {
  estimatedGas: number;
  gasPrice: number;
  totalCost: number;
}

export interface PrivacyConfig {
  maxDelay: number;
  minDelay: number;
  mixingEnabled: boolean;
}

export interface NetworkConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export type TransactionStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface TransactionMetadata {
  status: TransactionStatus;
  timestamp: number;
  retryCount: number;
  error?: string;
}
