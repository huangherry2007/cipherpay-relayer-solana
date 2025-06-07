import { Cluster } from '@solana/web3.js';
import { EnvironmentConfig } from './types';

export const devnetConfig: EnvironmentConfig = {
  name: 'devnet',
  cluster: 'devnet' as Cluster,
  rpcUrl: process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com',
  wsUrl: process.env.DEVNET_WS_URL || 'wss://api.devnet.solana.com',
  programId: process.env.DEVNET_PROGRAM_ID || '11111111111111111111111111111111',
  relayerProgramId: process.env.DEVNET_RELAYER_PROGRAM_ID || '22222222222222222222222222222222',
  commitment: 'confirmed',
  maxRetries: 5,
  gasConfig: {
    maxGasPrice: 100000000,  // 0.1 SOL
    minGasPrice: 100000,     // 0.0001 SOL
    gasMultiplier: 1.5
  },
  privacyConfig: {
    minDelay: 1000,    // 1 second
    maxDelay: 3000,    // 3 seconds
    mixingEnabled: true
  }
}; 