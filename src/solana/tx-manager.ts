// src/solana/tx-manager.ts
import { Connection, PublicKey, sendAndConfirmTransaction, Transaction, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { CipherpayAnchor } from "../../target/types/cipherpay_anchor.js";
import { SolanaProgram } from "./program.js";

export interface ShieldedDepositArgs {
  depositHash: Buffer;
  proofBytes: Buffer;
  publicInputsBytes: Buffer;
}

export interface ShieldedTransferArgs {
  nullifier: Buffer;
  proofBytes: Buffer;
  publicInputsBytes: Buffer;
}

export interface ShieldedWithdrawArgs {
  nullifier: Buffer;
  proofBytes: Buffer;
  publicInputsBytes: Buffer;
  recipient: PublicKey;
  amount: bigint;
  mint: PublicKey;
}

export class TxManager {
  constructor(
    private program: SolanaProgram,
    private payer: PublicKey
  ) {}

  async submitShieldedDepositAtomic(args: ShieldedDepositArgs): Promise<string> {
    try {
      const treePDA = this.program.getTreePDA();
      const rootCachePDA = this.program.getRootCachePDA();
      const depositMarkerPDA = this.program.getDepositMarkerPDA(args.depositHash);
      const vaultPDA = this.program.getVaultPDA();

      const tx = await this.program.program.methods
        .shieldedDepositAtomic(
          Array.from(args.depositHash),
          Array.from(args.proofBytes),
          Array.from(args.publicInputsBytes)
        )
        .accounts({
          payer: this.payer,
          tree: treePDA,
          rootCache: rootCachePDA,
          depositMarker: depositMarkerPDA,
          vaultPda: vaultPDA,
          // Additional accounts would be added here based on the IDL
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw new Error(`Shielded deposit failed: ${error}`);
    }
  }

  async callShieldedTransfer(args: ShieldedTransferArgs): Promise<string> {
    try {
      const treePDA = this.program.getTreePDA();
      const rootCachePDA = this.program.getRootCachePDA();
      const nullifierPDA = this.program.getNullifierPDA(args.nullifier);

      const tx = await this.program.program.methods
        .shieldedTransfer(
          Array.from(args.nullifier),
          Array.from(args.proofBytes),
          Array.from(args.publicInputsBytes)
        )
        .accounts({
          tree: treePDA,
          rootCache: rootCachePDA,
          nullifierRecord: nullifierPDA,
          payer: this.payer,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw new Error(`Shielded transfer failed: ${error}`);
    }
  }

  async callShieldedWithdraw(args: ShieldedWithdrawArgs): Promise<string> {
    try {
      const nullifierPDA = this.program.getNullifierPDA(args.nullifier);
      const rootCachePDA = this.program.getRootCachePDA();
      const vaultPDA = this.program.getVaultPDA();

      // Get vault token account PDA
      const vaultTokenAccountPDA = PublicKey.findProgramAddressSync(
        [
          vaultPDA.toBuffer(),
          Buffer.from([6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169]),
          args.mint.toBuffer()
        ],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      // Get recipient token account PDA
      const recipientTokenAccountPDA = PublicKey.findProgramAddressSync(
        [
          args.recipient.toBuffer(),
          Buffer.from([6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169]),
          args.mint.toBuffer()
        ],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      const tx = await this.program.program.methods
        .shieldedWithdraw(
          Array.from(args.nullifier),
          Array.from(args.proofBytes),
          Array.from(args.publicInputsBytes)
        )
        .accounts({
          nullifierRecord: nullifierPDA,
          rootCache: rootCachePDA,
          authority: this.payer,
          vaultPda: vaultPDA,
          vaultTokenAccount: vaultTokenAccountPDA,
          recipientTokenAccount: recipientTokenAccountPDA,
          recipientOwner: args.recipient,
          tokenMint: args.mint,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw new Error(`Shielded withdraw failed: ${error}`);
    }
  }

  // Helper method to get transaction status
  async getTransactionStatus(signature: string): Promise<any> {
    return await this.program.connection.getTransaction(signature);
  }

  // Helper method to get account info
  async getAccountInfo(publicKey: PublicKey): Promise<any> {
    return await this.program.connection.getAccountInfo(publicKey);
  }
}
