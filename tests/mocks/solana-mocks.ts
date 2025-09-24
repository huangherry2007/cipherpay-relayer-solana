// tests/mocks/solana-mocks.ts
import { jest } from '@jest/globals';
import { PublicKey, Keypair } from '@solana/web3.js';

export const mockConnection = {
  getAccountInfo: jest.fn(),
  getTransaction: jest.fn(),
  sendTransaction: jest.fn(),
  confirmTransaction: jest.fn(),
  getLatestBlockhash: jest.fn(),
  requestAirdrop: jest.fn(),
};

export const mockProgram = {
  methods: {
    shieldedDepositAtomic: jest.fn().mockReturnThis(),
    shieldedTransfer: jest.fn().mockReturnThis(),
    shieldedWithdraw: jest.fn().mockReturnThis(),
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  account: {
    depositMarker: {
      fetch: jest.fn(),
    },
    treeState: {
      fetch: jest.fn(),
    },
  },
};

export const mockProvider = {
  connection: mockConnection,
  wallet: {
    publicKey: Keypair.generate().publicKey,
  },
  sendAndConfirm: jest.fn(),
};

export const mockSolanaProgram = {
  program: mockProgram,
  provider: mockProvider,
  connection: mockConnection,
  programId: new PublicKey('9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o'),
  getTreePDA: jest.fn().mockReturnValue(Keypair.generate().publicKey),
  getVaultPDA: jest.fn().mockReturnValue(Keypair.generate().publicKey),
  getRootCachePDA: jest.fn().mockReturnValue(Keypair.generate().publicKey),
  getNullifierPDA: jest.fn().mockReturnValue(Keypair.generate().publicKey),
  getDepositMarkerPDA: jest.fn().mockReturnValue(Keypair.generate().publicKey),
};

export const mockTxManager = {
  submitShieldedDepositAtomic: jest.fn(),
  callShieldedTransfer: jest.fn(),
  callShieldedWithdraw: jest.fn(),
  getTransactionStatus: jest.fn(),
  getAccountInfo: jest.fn(),
};

export const mockEventWatcher = {
  onAll: jest.fn(),
  stop: jest.fn(),
  getRecentEvents: jest.fn().mockResolvedValue([]),
};
