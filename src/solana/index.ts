// src/solana/index.ts
export { SolanaProgram } from "./program.js";
export { TxManager, type ShieldedDepositArgs, type ShieldedTransferArgs, type ShieldedWithdrawArgs } from "./tx-manager.js";
export { EventWatcher, type SolanaEvent, type DepositCompletedEvent, type TransferCompletedEvent, type WithdrawCompletedEvent } from "./event-watcher.js";
