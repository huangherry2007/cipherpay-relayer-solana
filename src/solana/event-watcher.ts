// src/solana/event-watcher.ts
import { Program } from "@coral-xyz/anchor";
import type { CipherpayAnchor } from "../../target/types/cipherpay_anchor.js";
import { SolanaProgram } from "./program.js";

export interface DepositCompletedEvent {
  depositHash: Buffer;
  ownerCipherpayPubkey: Buffer;
  commitment: Buffer;
  oldMerkleRoot: Buffer;
  newMerkleRoot: Buffer;
  nextLeafIndex: number;
  mint: string;
}

export interface TransferCompletedEvent {
  nullifier: Buffer;
  out1Commitment: Buffer;
  out2Commitment: Buffer;
  encNote1Hash: Buffer;
  encNote2Hash: Buffer;
  merkleRootBefore: Buffer;
  newMerkleRoot1: Buffer;
  newMerkleRoot2: Buffer;
  nextLeafIndex: number;
  mint: string;
}

export interface WithdrawCompletedEvent {
  nullifier: Buffer;
  recipient: string;
  amount: bigint;
  mint: string;
}

export type SolanaEvent = 
  | { kind: "deposit"; data: DepositCompletedEvent }
  | { kind: "transfer"; data: TransferCompletedEvent }
  | { kind: "withdraw"; data: WithdrawCompletedEvent };

export class EventWatcher {
  private listeners: ((event: SolanaEvent) => void)[] = [];
  private isWatching = false;

  constructor(private program: SolanaProgram) {}

  onAll(cb: (event: SolanaEvent) => void) {
    this.listeners.push(cb);
    
    if (!this.isWatching) {
      this.startWatching();
    }
  }

  private async startWatching() {
    if (this.isWatching) return;
    
    this.isWatching = true;

    // Listen for deposit completed events
    this.program.program.addEventListener("depositCompleted", (event: any) => {
      const depositEvent: DepositCompletedEvent = {
        depositHash: Buffer.from(event.depositHash),
        ownerCipherpayPubkey: Buffer.from(event.ownerCipherpayPubkey),
        commitment: Buffer.from(event.commitment),
        oldMerkleRoot: Buffer.from(event.oldMerkleRoot),
        newMerkleRoot: Buffer.from(event.newMerkleRoot),
        nextLeafIndex: event.nextLeafIndex,
        mint: event.mint.toString()
      };

      this.notifyListeners({ kind: "deposit", data: depositEvent });
    });

    // Listen for transfer completed events
    this.program.program.addEventListener("transferCompleted", (event: any) => {
      const transferEvent: TransferCompletedEvent = {
        nullifier: Buffer.from(event.nullifier),
        out1Commitment: Buffer.from(event.out1Commitment),
        out2Commitment: Buffer.from(event.out2Commitment),
        encNote1Hash: Buffer.from(event.encNote1Hash),
        encNote2Hash: Buffer.from(event.encNote2Hash),
        merkleRootBefore: Buffer.from(event.merkleRootBefore),
        newMerkleRoot1: Buffer.from(event.newMerkleRoot1),
        newMerkleRoot2: Buffer.from(event.newMerkleRoot2),
        nextLeafIndex: event.nextLeafIndex,
        mint: event.mint.toString()
      };

      this.notifyListeners({ kind: "transfer", data: transferEvent });
    });

    // Listen for withdraw completed events
    this.program.program.addEventListener("withdrawCompleted", (event: any) => {
      const withdrawEvent: WithdrawCompletedEvent = {
        nullifier: Buffer.from(event.nullifier),
        recipient: event.recipient.toString(),
        amount: BigInt(event.amount),
        mint: event.mint.toString()
      };

      this.notifyListeners({ kind: "withdraw", data: withdrawEvent });
    });
  }

  private notifyListeners(event: SolanaEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in event listener:", error);
      }
    });
  }

  // Method to stop watching events
  stop() {
    this.isWatching = false;
    this.listeners = [];
  }

  // Method to get recent events
  async getRecentEvents(limit: number = 100): Promise<SolanaEvent[]> {
    // This would typically query the Solana RPC for recent events
    // For now, we'll return an empty array as this requires more complex implementation
    return [];
  }
}
