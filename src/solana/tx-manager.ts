/* ESM */
// src/solana/tx-manager.ts
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram, // ⬅️ add
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  ACCOUNT_SIZE as TOKEN_ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  createSyncNativeInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";

const TREE_SEED = Buffer.from("tree");
const ROOT_CACHE_SEED = Buffer.from("root_cache");
const VAULT_SEED = Buffer.from("vault");
const DEPOSIT_SEED = Buffer.from("deposit");
// ⬇️ NEW (matches tests/transfer.ts)
const NULLIFIER_SEED = Buffer.from("nullifier");

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

type AnchorCtx = {
  program: anchor.Program<any>;
  provider: anchor.AnchorProvider;
  connection: anchor.web3.Connection;
};

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}
function bn(x: number | bigint | BN): BN {
  // @ts-ignore
  if (BN.isBN?.(x)) return x as BN;
  return new BN(x.toString(), 10);
}
function slice32(buf: Buffer, i: number): Buffer {
  const off = i * 32;
  return buf.subarray(off, off + 32);
}
function hexLE32(buf: Buffer): string {
  return Buffer.from(buf).toString("hex");
}

export default class TxManager {
  private readonly program: anchor.Program<any>;
  private readonly provider: anchor.AnchorProvider;
  private readonly connection: anchor.web3.Connection;
  private readonly programId: PublicKey;

  constructor(ctx: AnchorCtx) {
    this.program = ctx.program;
    this.provider = ctx.provider;
    this.connection = ctx.connection;
    this.programId = this.program.programId;
  }

  private async ensurePayerFunds(minLamports = 60_000_000): Promise<void> {
    const payer = this.provider.wallet.publicKey;
    const bal = await this.connection.getBalance(payer, { commitment: "confirmed" });
    if (bal >= minLamports) return;

    const want = Math.max(120_000_000, minLamports * 2);
    const sig = await this.connection.requestAirdrop(payer, want);
    await this.connection.confirmTransaction(sig, "confirmed");

    const bal2 = await this.connection.getBalance(payer, { commitment: "confirmed" });
    if (bal2 < minLamports) {
      throw new Error(`Airdrop failed: balance=${bal2}, needed>=${minLamports}`);
    }
  }

  private async getMintDecimals(mint: PublicKey): Promise<number> {
    if (mint.equals(NATIVE_MINT)) return 9;
    const mi = await getMint(this.connection, mint, "confirmed");
    return mi.decimals;
  }

  private memoIxUtf8(s: string): TransactionInstruction {
    return new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(s, "utf8"),
    });
  }

  private async accountExists(pubkey: PublicKey): Promise<boolean> {
    const ai = await this.connection.getAccountInfo(pubkey, "confirmed");
    return !!ai;
  }

  private async sendIxs(ixs: TransactionInstruction[]) {
    if (ixs.length === 0) return;
    const tx = new anchor.web3.Transaction().add(...ixs);
    await this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  }

  private async maybeInitRootCacheIx(rootCachePda: PublicKey, payer: PublicKey) {
    const ai = await this.connection.getAccountInfo(rootCachePda, "confirmed");
    if (ai) return null;
    return await (this.program as any).methods
      .initializeRootCache()
      .accountsPartial({
        rootCache: rootCachePda,
        authority: payer,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  private async buildSetupIxs(
    payer: PublicKey,
    mint: PublicKey,
    vaultOwnerPda: PublicKey,
    amount: BN,
    rootCachePda: PublicKey
  ): Promise<{ ixs: TransactionInstruction[]; payerAta: PublicKey; vaultAta: PublicKey }> {
    const ixs: TransactionInstruction[] = [];

    const payerAta = getAssociatedTokenAddressSync(
      mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAta = getAssociatedTokenAddressSync(
      mint, vaultOwnerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRoot) ixs.push(initRoot);

    if (!(await this.accountExists(payerAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer, payerAta, payer, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    if (!(await this.accountExists(vaultAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer, vaultAta, vaultOwnerPda, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    if (mint.equals(NATIVE_MINT) && amount.gt(new BN(0))) {
      ixs.push(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: payerAta, lamports: Number(amount) }),
        createSyncNativeInstruction(payerAta)
      );
    }

    return { ixs, payerAta, vaultAta };
  }

  /** Idempotently ensure root cache + both ATAs (vault & recipient) exist for withdraw. */
  private async buildWithdrawSetupIxs(
    payer: PublicKey,
    mint: PublicKey,
    vaultOwnerPda: PublicKey,
    rootCachePda: PublicKey
  ): Promise<{ ixs: TransactionInstruction[]; recipientAta: PublicKey; vaultAta: PublicKey }> {
    const ixs: TransactionInstruction[] = [];

    const recipientAta = getAssociatedTokenAddressSync(
      mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAta = getAssociatedTokenAddressSync(
      mint, vaultOwnerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRoot) ixs.push(initRoot);

    if (!(await this.accountExists(recipientAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer, recipientAta, payer, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    if (!(await this.accountExists(vaultAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer, vaultAta, vaultOwnerPda, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // NOTE: for withdraw we DO NOT pre-fund/unwrap wSOL here. Program will transfer from vault -> recipient.
    return { ixs, recipientAta, vaultAta };
  }

  /**
   * Submit deposit with **binary** proof + publics.
   * - `publicInputsBytes` MUST be 7×32 in the SAME Circom order used by your working Anchor test.
   * - `proofBytes` MUST be 256 bytes (G1||G2||G1) with LE limbs and the same G2 pair ordering as your converter.
   */
  async submitShieldedDepositAtomicBytes(args: {
    mint: PublicKey;
    amount: bigint | number | BN;
    proofBytes: Buffer;
    publicInputsBytes: Buffer;
  }): Promise<string> {
    const payer = this.provider.wallet.publicKey;

    if (args.proofBytes.length !== 256) {
      throw new Error(`proofBytes must be 256 bytes, got ${args.proofBytes.length}`);
    }
    if (args.publicInputsBytes.length !== 7 * 32) {
      throw new Error(`publicInputsBytes must be 224 bytes, got ${args.publicInputsBytes.length}`);
    }

    // Important: derive deposit hash from publics[5] (LE) — identical to anchor test
    const depositHashBytes = slice32(args.publicInputsBytes, 5);
    const depositHashHexLE = hexLE32(depositHashBytes);

    const rentAta = await this.connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
    const amountBN = bn(args.amount);
    const cushion = 40_000_000;
    const minNeeded = Number(amountBN) + rentAta * 2 + cushion;
    await this.ensurePayerFunds(minNeeded);

    const treePda = pda([TREE_SEED], this.programId);
    const rootCachePda = pda([ROOT_CACHE_SEED], this.programId);
    const vaultOwnerPda = pda([VAULT_SEED], this.programId);
    const depositMarkerPda = pda([DEPOSIT_SEED, depositHashBytes], this.programId);

    const mintDecimals = await this.getMintDecimals(args.mint);

    // Stage A — setup
    const { ixs: setupIxs, payerAta, vaultAta } = await this.buildSetupIxs(
      payer, args.mint, vaultOwnerPda, amountBN, rootCachePda
    );
    await this.sendIxs(setupIxs);

    // Stage B — deposit
    const preIxs: TransactionInstruction[] = [];
    // Transfer first
    if (amountBN.gt(new BN(0))) {
      preIxs.push(
        createTransferCheckedInstruction(
          payerAta,
          args.mint,
          vaultAta,
          payer,
          BigInt(amountBN.toString()),
          mintDecimals
        )
      );
    }
    // Memo with **prefix** like your anchor test ("deposit:" + hex)
    preIxs.push(this.memoIxUtf8("deposit:" + depositHashHexLE));

    const run = () =>
      (this.program as any).methods
        .shieldedDepositAtomic(depositHashBytes, args.proofBytes, args.publicInputsBytes)
        .accountsPartial({
          payer,
          tree: treePda,
          rootCache: rootCachePda,
          depositMarker: depositMarkerPda,
          vaultPda: vaultOwnerPda,
          vaultTokenAccount: vaultAta,
          tokenMint: args.mint,
          instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .preInstructions(preIxs)
        .rpc();

    try {
      return await run();
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m.includes("insufficient lamports") || m.includes("custom program error: 0x1")) {
        await this.ensurePayerFunds(minNeeded + 80_000_000);
        return await run();
      }
      throw e;
    }
  }

  /**
   * ⬇️ NEW: Submit **shielded transfer** with binary proof + 9×32 public inputs.
   * Mirrors `tests/transfer.ts` (nullifier seed, account set, CU limit).
   *
   * NOTE: `mint` is accepted for parity with relayer API but is NOT required by the on-chain IX.
   */
  async submitShieldedTransferAtomicBytes(args: {
    mint: PublicKey;                // accepted but unused by the IX
    proofBytes: Buffer;             // 256 bytes
    publicInputsBytes: Buffer;      // 9*32 bytes
    computeUnitLimit?: number;      // optional override, default from env CU_LIMIT or 800_000
  }): Promise<string> {
    const payer = this.provider.wallet.publicKey;

    if (args.proofBytes.length !== 256) {
      throw new Error(`proofBytes must be 256 bytes, got ${args.proofBytes.length}`);
    }
    if (args.publicInputsBytes.length !== 9 * 32) {
      throw new Error(`publicInputsBytes must be 288 bytes, got ${args.publicInputsBytes.length}`);
    }

    // Derive nullifier from public signals slot 2 (LE), same as tests/transfer.ts
    const nullifierBuf = slice32(args.publicInputsBytes, 2);

    const treePda = pda([TREE_SEED], this.programId);
    const rootCachePda = pda([ROOT_CACHE_SEED], this.programId);
    const nullifierRecordPda = pda([NULLIFIER_SEED, nullifierBuf], this.programId);

    // Ensure the Merkle root cache exists (idempotent)
    const setupIxs: TransactionInstruction[] = [];
    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRoot) setupIxs.push(initRoot);

    // Compute budget (default 800k or env CU_LIMIT)
    const cu = Number(process.env.CU_LIMIT ?? 800_000);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: args.computeUnitLimit ?? cu });

    // Build program instruction (must pass a 32-byte Buffer for nullifier)
    const anchorIx = await (this.program as any).methods
      .shieldedTransfer(nullifierBuf, args.proofBytes, args.publicInputsBytes)
      .accountsPartial({
        payer,
        tree: treePda,
        rootCache: rootCachePda,
        nullifierRecord: nullifierRecordPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new anchor.web3.Transaction();
    // setup (root cache), CU limit, then the zk ix
    if (setupIxs.length) tx.add(...setupIxs);
    tx.add(cuIx, anchorIx);

    const sig = await this.provider.sendAndConfirm(tx, [], { skipPreflight: false, commitment: "confirmed" });
    return sig;
  }

  /**
   * Submit **shielded withdraw** with binary proof + 5×32 public inputs.
   * Public signals order:
   *   [0]=nullifier, [1]=merkleRoot, [2]=recipientWalletPubKey, [3]=amount, [4]=tokenId
   * Assumes recipient = payer (create payer's ATA if missing).
   */
  async submitShieldedWithdrawAtomicBytes(args: {
    mint: PublicKey;
    proofBytes: Buffer;            // 256
    publicInputsBytes: Buffer;     // 5 * 32
    computeUnitLimit?: number;
  }): Promise<string> {
    const payer = this.provider.wallet.publicKey;

    if (args.proofBytes.length !== 256) {
      throw new Error(`proofBytes must be 256 bytes, got ${args.proofBytes.length}`);
    }
    if (args.publicInputsBytes.length !== 5 * 32) {
      throw new Error(`publicInputsBytes must be 160 bytes, got ${args.publicInputsBytes.length}`);
    }

    // [0] = nullifier (LE)
    const nullifierBuf   = slice32(args.publicInputsBytes, 0);
    const nullifierHexLE = hexLE32(nullifierBuf);

    const treePda       = pda([TREE_SEED], this.programId);
    const rootCachePda  = pda([ROOT_CACHE_SEED], this.programId);
    const vaultOwnerPda = pda([VAULT_SEED], this.programId);
    const nullifierPda  = pda([NULLIFIER_SEED, nullifierBuf], this.programId);

    // Ensure root_cache + both ATAs (vault & recipient=payer)
    const { ixs: setupIxs, recipientAta, vaultAta } = await this.buildWithdrawSetupIxs(
      payer, args.mint, vaultOwnerPda, rootCachePda
    );

    const cuUnits = Number(process.env.CU_LIMIT ?? 800_000);
    const cuIx    = ComputeBudgetProgram.setComputeUnitLimit({ units: args.computeUnitLimit ?? cuUnits });
    const memoIx  = this.memoIxUtf8("withdraw:" + nullifierHexLE);

    // 🔴 FIX: include `recipientOwner` (equals payer) + full token accounts
    const anchorIx = await (this.program as any).methods
      .shieldedWithdraw(nullifierBuf, args.proofBytes, args.publicInputsBytes)
      .accountsPartial({
        payer,
        // optional: if your IDL doesn't include `tree`, it's ignored; safe to omit too.
        // tree: treePda,
        rootCache: rootCachePda,
        nullifierRecord: nullifierPda,
        vaultPda: vaultOwnerPda,
        vaultTokenAccount: vaultAta,
        recipientOwner: payer,            // ← required by program (matches tests/withdraw.ts)
        recipientTokenAccount: recipientAta,
        tokenMint: args.mint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new anchor.web3.Transaction();
    if (setupIxs.length) tx.add(...setupIxs);
    tx.add(cuIx, memoIx, anchorIx);

    const sig = await this.provider.sendAndConfirm(tx, [], {
      skipPreflight: false,
      commitment: "confirmed",
    });
    return sig;
  }

}
