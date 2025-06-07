import { Cluster } from '@solana/web3.js';
import { EnvironmentConfig } from './types';

export const testnetConfig: EnvironmentConfig = {
  name: 'testnet',
  cluster: 'testnet' as Cluster,
  rpcUrl: process.env.TESTNET_RPC_URL || 'https://api.testnet.solana.com',
  wsUrl: process.env.TESTNET_WS_URL || 'wss://api.testnet.solana.com',
  programId: process.env.TESTNET_PROGRAM_ID || '11111111111111111111111111111111',
  relayerProgramId: process.env.TESTNET_RELAYER_PROGRAM_ID || '22222222222222222222222222222222',
  commitment: 'confirmed',
  maxRetries: 10,
  gasConfig: {
    maxGasPrice: 10000000,   // 0.01 SOL
    minGasPrice: 10000,      // 0.00001 SOL
    gasMultiplier: 2.0
  },
  privacyConfig: {
    minDelay: 500,     // 0.5 seconds
    maxDelay: 2000,    // 2 seconds
    mixingEnabled: false
  }
}; 