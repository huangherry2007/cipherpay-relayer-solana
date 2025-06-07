import { Cluster } from '@solana/web3.js';
import { EnvironmentConfig } from './types';

export const localConfig: EnvironmentConfig = {
  name: 'local',
  cluster: 'localnet' as Cluster,
  rpcUrl: process.env.LOCAL_RPC_URL || 'http://localhost:8899',
  wsUrl: process.env.LOCAL_WS_URL || 'ws://localhost:8900',
  programId: process.env.LOCAL_PROGRAM_ID || '11111111111111111111111111111111',
  relayerProgramId: process.env.LOCAL_RELAYER_PROGRAM_ID || '22222222222222222222222222222222',
  commitment: 'confirmed',
  maxRetries: 10,
  gasConfig: {
    maxGasPrice: 1000000,    // 0.001 SOL
    minGasPrice: 1000,       // 0.000001 SOL
    gasMultiplier: 1.0
  },
  privacyConfig: {
    minDelay: 100,      // 0.1 seconds
    maxDelay: 1000,     // 1 second
    mixingEnabled: false
  }
}; 