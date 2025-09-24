// src/solana/index.ts
export { SolanaProgram } from "./program.ts";
export { TxManager, type ShieldedDepositArgs, type ShieldedTransferArgs, type ShieldedWithdrawArgs } from "./tx-manager.ts";
export { EventWatcher, type SolanaEvent, type DepositCompletedEvent, type TransferCompletedEvent, type WithdrawCompletedEvent } from "./event-watcher.ts";
