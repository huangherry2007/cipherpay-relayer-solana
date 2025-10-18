/* ESM */
// src/solana/tx-manager.ts
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
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
function pk(v?: string | PublicKey): PublicKey | undefined {
  if (!v) return undefined;
  return typeof v === "string" ? new PublicKey(v) : v;
}

/** Optional client overrides for deposit source. */
export type DepositSourceOverride = {
  /** Base58 or PublicKey of the token owner paying the deposit. Defaults to relayer payer. */
  sourceOwner?: string | PublicKey;
  /** Base58 or PublicKey of an explicit source ATA to use (skips creating an ATA). */
  sourceTokenAccount?: string | PublicKey;
  /** If true, use a pre-created delegate to move tokens from the source ATA. */
  useDelegate?: boolean;
};

/** Optional client overrides for withdraw target. */
export type WithdrawTargetOverride = {
  /** Base58 or PublicKey of the recipient owner. Defaults to relayer payer. */
  recipientOwner?: string | PublicKey;
  /** Base58 or PublicKey of an explicit recipient ATA to use (skips deriving/creating). */
  recipientTokenAccount?: string | PublicKey;
};

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
    sourceOwner: PublicKey,
    mint: PublicKey,
    vaultOwnerPda: PublicKey,
    amount: BN,
    rootCachePda: PublicKey,
    explicitSourceAta?: PublicKey
  ): Promise<{ ixs: TransactionInstruction[]; sourceAta: PublicKey; vaultAta: PublicKey }> {
    const ixs: TransactionInstruction[] = [];

    const sourceAta =
      explicitSourceAta ??
      getAssociatedTokenAddressSync(
        mint, sourceOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

    const vaultAta = getAssociatedTokenAddressSync(
      mint, vaultOwnerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, sourceOwner);
    if (initRoot) ixs.push(initRoot);

    // Only create the derived ATA when we're NOT using an explicit one
    if (!explicitSourceAta && !(await this.accountExists(sourceAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          sourceOwner, sourceAta, sourceOwner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    if (!(await this.accountExists(vaultAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          sourceOwner, vaultAta, vaultOwnerPda, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    if (mint.equals(NATIVE_MINT) && amount.gt(new BN(0))) {
      ixs.push(
        SystemProgram.transfer({ fromPubkey: sourceOwner, toPubkey: sourceAta, lamports: Number(amount) }),
        createSyncNativeInstruction(sourceAta)
      );
    }

    return { ixs, sourceAta, vaultAta };
  }

  /** Idempotently ensure root cache + both ATAs (vault & recipient) exist for withdraw. */
  private async buildWithdrawSetupIxs(
    payer: PublicKey,
    mint: PublicKey,
    vaultOwnerPda: PublicKey,
    rootCachePda: PublicKey,
    recipientOwnerOverride?: PublicKey
  ): Promise<{ ixs: TransactionInstruction[]; recipientAta: PublicKey; recipientOwner: PublicKey; vaultAta: PublicKey }> {
    const ixs: TransactionInstruction[] = [];

    const recipientOwner = recipientOwnerOverride ?? payer;

    const recipientAta = getAssociatedTokenAddressSync(
      mint, recipientOwner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAta = getAssociatedTokenAddressSync(
      mint, vaultOwnerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRoot) ixs.push(initRoot);

    if (!(await this.accountExists(recipientAta))) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer, recipientAta, recipientOwner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
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

    return { ixs, recipientAta, recipientOwner, vaultAta };
  }

  /**
   * Submit deposit with **binary** proof + publics.
   * publicInputsBytes MUST be 7×32; proofBytes MUST be 256.
   * Optional `source` overrides (owner/ATA/useDelegate).
   */
  async submitShieldedDepositAtomicBytes(args: {
    mint: PublicKey;
    amount: bigint | number | BN;
    proofBytes: Buffer;
    publicInputsBytes: Buffer;
    source?: DepositSourceOverride;
  }): Promise<string> {
    const payer = this.provider.wallet.publicKey;

    if (args.proofBytes.length !== 256) {
      throw new Error(`proofBytes must be 256 bytes, got ${args.proofBytes.length}`);
    }
    if (args.publicInputsBytes.length !== 7 * 32) {
      throw new Error(`publicInputsBytes must be 224 bytes, got ${args.publicInputsBytes.length}`);
    }

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

    // Normalize overrides
    const srcOwner = pk(args.source?.sourceOwner) ?? payer;
    const explicitSourceAta = pk(args.source?.sourceTokenAccount);
    const useDelegate = !!args.source?.useDelegate;

    const mintDecimals = await this.getMintDecimals(args.mint);

    // Stage A — setup (creates ATAs if needed unless an explicit source ATA is provided)
    const { ixs: setupIxs, sourceAta, vaultAta } = await this.buildSetupIxs(
      srcOwner, args.mint, vaultOwnerPda, amountBN, rootCachePda, explicitSourceAta
    );
    await this.sendIxs(setupIxs);

    // Stage B — deposit
    const preIxs: TransactionInstruction[] = [];
    if (amountBN.gt(new BN(0))) {
      // If `useDelegate`, caller is responsible for having set a delegate on sourceAta
      // that the relayer can sign with. Otherwise, we transfer as `srcOwner` (payer in tests).
      preIxs.push(
        createTransferCheckedInstruction(
          sourceAta,
          args.mint,
          vaultAta,
          srcOwner, // authority
          BigInt(amountBN.toString()),
          mintDecimals
        )
      );
    }
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
   * Submit **shielded transfer** with binary proof + 9×32 public inputs.
   */
  async submitShieldedTransferAtomicBytes(args: {
    mint: PublicKey;                // accepted but unused by the IX
    proofBytes: Buffer;             // 256 bytes
    publicInputsBytes: Buffer;      // 9*32 bytes
    computeUnitLimit?: number;      // optional override
  }): Promise<string> {
    const payer = this.provider.wallet.publicKey;

    if (args.proofBytes.length !== 256) {
      throw new Error(`proofBytes must be 256 bytes, got ${args.proofBytes.length}`);
    }
    if (args.publicInputsBytes.length !== 9 * 32) {
      throw new Error(`publicInputsBytes must be 288 bytes, got ${args.publicInputsBytes.length}`);
    }

    const nullifierBuf = slice32(args.publicInputsBytes, 2);

    const treePda = pda([TREE_SEED], this.programId);
    const rootCachePda = pda([ROOT_CACHE_SEED], this.programId);
    const nullifierRecordPda = pda([NULLIFIER_SEED, nullifierBuf], this.programId);

    const setupIxs: TransactionInstruction[] = [];
    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRoot) setupIxs.push(initRoot);

    const cu = Number(process.env.CU_LIMIT ?? 800_000);
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: args.computeUnitLimit ?? cu });

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
    if (setupIxs.length) tx.add(...setupIxs);
    tx.add(cuIx, anchorIx);

    const sig = await this.provider.sendAndConfirm(tx, [], { skipPreflight: false, commitment: "confirmed" });
    return sig;
  }

  /**
   * Submit **shielded withdraw** with binary proof + 5×32 public inputs.
   * Public signals order: [nullifier, merkleRoot, recipientWalletPubKey, amount, tokenId]
   * Optional target overrides (owner/ATA).
   */
  async submitShieldedWithdrawAtomicBytes(args: {
    mint: PublicKey;
    proofBytes: Buffer;            // 256
    publicInputsBytes: Buffer;     // 5 * 32
    computeUnitLimit?: number;
    target?: WithdrawTargetOverride;
  }): Promise<string> {
    const payer = this.provider.wallet.publicKey;

    if (args.proofBytes.length !== 256) {
      throw new Error(`proofBytes must be 256 bytes, got ${args.proofBytes.length}`);
    }
    if (args.publicInputsBytes.length !== 5 * 32) {
      throw new Error(`publicInputsBytes must be 160 bytes, got ${args.publicInputsBytes.length}`);
    }

    const nullifierBuf   = slice32(args.publicInputsBytes, 0);
    const nullifierHexLE = hexLE32(nullifierBuf);

    const rootCachePda  = pda([ROOT_CACHE_SEED], this.programId);
    const vaultOwnerPda = pda([VAULT_SEED], this.programId);
    const nullifierPda  = pda([NULLIFIER_SEED, nullifierBuf], this.programId);

    // Normalize overrides
    const targetOwnerOverride = pk(args.target?.recipientOwner);
    const explicitTargetAta   = pk(args.target?.recipientTokenAccount);

    // Ensure root_cache + both ATAs (vault & recipient)
    const { ixs: setupIxs, recipientAta: defaultRecipientAta, recipientOwner, vaultAta } =
      await this.buildWithdrawSetupIxs(payer, args.mint, vaultOwnerPda, rootCachePda, targetOwnerOverride);

    const recipientAta = explicitTargetAta ?? defaultRecipientAta;

    const cuUnits = Number(process.env.CU_LIMIT ?? 800_000);
    const cuIx    = ComputeBudgetProgram.setComputeUnitLimit({ units: args.computeUnitLimit ?? cuUnits });
    const memoIx  = this.memoIxUtf8("withdraw:" + nullifierHexLE);

    const anchorIx = await (this.program as any).methods
      .shieldedWithdraw(nullifierBuf, args.proofBytes, args.publicInputsBytes)
      .accountsPartial({
        payer,
        rootCache: rootCachePda,
        nullifierRecord: nullifierPda,
        vaultPda: vaultOwnerPda,
        vaultTokenAccount: vaultAta,
        recipientOwner,                  // always a PublicKey
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
