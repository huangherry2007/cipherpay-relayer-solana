import { Cluster } from '@solana/web3.js';

export interface GasConfig {
  maxGasPrice: number;
  minGasPrice: number;
  gasMultiplier: number;
}

export interface PrivacyConfig {
  minDelay: number;
  maxDelay: number;
  mixingEnabled: boolean;
}

export interface EnvironmentConfig {
  name: string;
  cluster: Cluster;
  rpcUrl: string;
  wsUrl: string;
  programId: string;
  relayerProgramId: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
  maxRetries: number;
  gasConfig: GasConfig;
  privacyConfig: PrivacyConfig;
} 