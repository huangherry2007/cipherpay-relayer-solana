import { Cluster } from '@solana/web3.js';
import { EnvironmentConfig } from './types';

export const mainnetConfig: EnvironmentConfig = {
  name: 'mainnet',
  cluster: 'mainnet-beta' as Cluster,
  rpcUrl: process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
  wsUrl: process.env.MAINNET_WS_URL || 'wss://api.mainnet-beta.solana.com',
  programId: process.env.MAINNET_PROGRAM_ID || '11111111111111111111111111111111',
  relayerProgramId: process.env.MAINNET_RELAYER_PROGRAM_ID || '22222222222222222222222222222222',
  commitment: 'confirmed',
  maxRetries: 3,
  gasConfig: {
    maxGasPrice: 1000000000, // 1 SOL
    minGasPrice: 1000000,    // 0.001 SOL
    gasMultiplier: 1.2
  },
  privacyConfig: {
    minDelay: 2000,    // 2 seconds
    maxDelay: 5000,    // 5 seconds
    mixingEnabled: true
  }
}; 