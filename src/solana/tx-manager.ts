/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import BN from "bn.js";

import {
  SYSVAR_INSTRUCTIONS_PUBKEY,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Connection,
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

/* ============================================================================
   Seeds (must match on-chain)
============================================================================ */
const TREE_SEED = Buffer.from("tree");
const ROOT_CACHE_SEED = Buffer.from("root_cache");
const VAULT_SEED = Buffer.from("vault");
const DEPOSIT_SEED = Buffer.from("deposit");

// Memo program (UTF-8 string payload)
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

/* ============================================================================
   Types
============================================================================ */
export type Bytes = Uint8Array | Buffer;

export interface ShieldedDepositArgs {
  depositHash: string | Bytes;     // 32-byte hex (64 chars) or raw 32 bytes
  proofBytes?: Bytes;              // packed proof (preferred)
  publicInputsBytes?: Bytes;       // packed public inputs (preferred)

  // Optional raw artifacts (fallback packer)
  proof?: {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: "groth16";
    curve: "bn128";
  };
  publicSignals?: string[];        // decimal strings

  mint: PublicKey;                 // token mint (use NATIVE_MINT for wSOL)
  amount: bigint | number | BN;    // lamports if mint == NATIVE_MINT
  vaultTokenAccount?: PublicKey;   // optional override
  payer?: PublicKey;               // default: provider wallet
}

type AnchorCtx = {
  program: Program<any>;
  provider: anchor.AnchorProvider;   // use THIS provider/connection
  connection: Connection;
};

/* ============================================================================
   Helpers
============================================================================ */
function normalizeDepositHash(
  x: string | Bytes
): { bytes32: Buffer; hexLower: string } {
  if (typeof x !== "string") {
    if (x.length !== 32) throw new Error("depositHash must be 32 bytes");
    const b = Buffer.from(x);
    return { bytes32: b, hexLower: b.toString("hex") };
  }
  const hex = (x.startsWith("0x") ? x.slice(2) : x).toLowerCase();
  if (hex.length !== 64) throw new Error(`depositHash hex must be 64 chars, got ${hex.length}`);
  const b = Buffer.from(hex, "hex");
  return { bytes32: b, hexLower: hex };
}

function bn(x: number | bigint | BN): BN {
  // @ts-ignore
  if (BN.isBN?.(x)) return x as BN;
  return new BN(x.toString(), 10);
}

function wrapErr(prefix: string, e: unknown) {
  const msg = typeof e === "object" && e && "message" in (e as any) ? (e as any).message : String(e);
  const err = new Error(`${prefix}: ${msg}`);
  (err as any).cause = e;
  return err;
}

/* ---- integer packing ---- */
function bigFromStr(s: string): bigint {
  const t = s.trim();
  return t.startsWith("0x") || t.startsWith("0X") ? BigInt(t) : BigInt(t);
}
function be32(n: bigint): Buffer {
  const out = Buffer.alloc(32);
  let x = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
function le32(n: bigint): Buffer {
  const out = Buffer.alloc(32);
  let x = n;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Public signals → 32-byte LE limbs (so on-chain can read amount from first 8 bytes). */
function packPublicSignalsLE(signals: string[]): Buffer {
  return Buffer.concat(signals.map((s) => le32(bigFromStr(s))));
}

/** Groth16 proof (BN254) → 8 limbs × 32-byte BE (standard coordinate serialization). */
function packGroth16ProofBE(proof: ShieldedDepositArgs["proof"]): Buffer {
  if (!proof) throw new Error("proof is required");
  const [ax, ay] = [proof.pi_a[0], proof.pi_a[1]];
  const [[bx1, bx2], [by1, by2]] = proof.pi_b;
  const [cx, cy] = [proof.pi_c[0], proof.pi_c[1]];
  return Buffer.concat([
    be32(bigFromStr(ax)), be32(bigFromStr(ay)),
    be32(bigFromStr(bx1)), be32(bigFromStr(bx2)),
    be32(bigFromStr(by1)), be32(bigFromStr(by2)),
    be32(bigFromStr(cx)), be32(bigFromStr(cy)),
  ]);
}

/* ============================================================================
   TxManager
============================================================================ */
export default class TxManager {
  private readonly program: Program<any>;
  private readonly provider: anchor.AnchorProvider;   // use ctx.provider
  private readonly connection: Connection;            // use ctx.connection
  private readonly programId: PublicKey;

  constructor(ctx: AnchorCtx) {
    // IMPORTANT: stick to the caller’s provider/connection (e.g., devnet RPC),
    // not program.provider which may be a local test-validator without Memo.
    this.program = ctx.program;
    this.provider = ctx.provider;
    this.connection = ctx.connection;
    this.programId = this.program.programId;
  }

  /** Prefund the provider’s wallet with a cushion. */
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
      data: Buffer.from(s, "utf8"), // Memo requires valid UTF-8
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

  /** Build setup ixs: create ATAs if missing, (for wSOL) wrap SOL, and init root_cache. */
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

    // Init root cache if missing (do this in setup tx)
    const initRoot = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRoot) ixs.push(initRoot);

    // Create ATAs only if they don't exist to keep deposit tx tiny.
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

    // For WSOL: pre-credit payer's ATA with lamports, then sync.
    if (mint.equals(NATIVE_MINT) && amount.gt(new BN(0))) {
      ixs.push(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: payerAta, lamports: Number(amount) }),
        createSyncNativeInstruction(payerAta)
      );
    }

    return { ixs, payerAta, vaultAta };
  }

  async submitShieldedDepositAtomic(args: ShieldedDepositArgs): Promise<string> {
    // Use the caller’s provider wallet by default
    const payer = args.payer ?? this.provider.wallet.publicKey;

    // Normalize deposit hash both as bytes (for program) and ASCII hex (for memo)
    const { bytes32: depositHashBytes, hexLower: depositHashHex } = normalizeDepositHash(args.depositHash);

    // Estimate rent (two ATAs) + cushion for program-side inits (deposit_marker/root_cache)
    const rentAta = await this.connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
    const amountBN = bn(args.amount);
    const cushion = 40_000_000; // plenty for fees + Anchor inits
    const minNeeded = Number(amountBN) + rentAta * 2 + cushion;

    await this.ensurePayerFunds(minNeeded);

    // PDAs (match on-chain)
    const treePda = pda([TREE_SEED], this.programId);
    const rootCachePda = pda([ROOT_CACHE_SEED], this.programId);
    const vaultOwnerPda = pda([VAULT_SEED, args.mint.toBuffer()], this.programId);
    const depositMarkerPda = pda([DEPOSIT_SEED, depositHashBytes], this.programId);

    const mintDecimals = await this.getMintDecimals(args.mint);

    // -------- Stage A: SETUP TX --------
    const { ixs: setupIxs, payerAta, vaultAta } = await this.buildSetupIxs(
      payer, args.mint, vaultOwnerPda, amountBN, rootCachePda
    );
    const vaultTokenAccount = args.vaultTokenAccount ?? vaultAta;

    await this.sendIxs(setupIxs); // ATA creates / wSOL wrap / root_cache init

    // -------- Stage B: DEPOSIT TX (minimal) --------
    const preIxs: TransactionInstruction[] = [];

    // Required TransferChecked (payerATA -> vaultATA) for `amount`
    if (amountBN.gt(new BN(0))) {
      preIxs.push(
        createTransferCheckedInstruction(
          payerAta,
          args.mint,
          vaultTokenAccount,
          payer,                     // authority
          BigInt(amountBN.toString()),
          mintDecimals
        )
      );
    }

    // Memo with deposit hash **as lowercase hex string** (valid UTF-8)
    preIxs.push(this.memoIxUtf8(depositHashHex));

    // Pack proof/publics
    let proofPacked: Buffer;
    let inputsPacked: Buffer;
    if (args.proofBytes && args.publicInputsBytes) {
      proofPacked = Buffer.from(args.proofBytes);
      inputsPacked = Buffer.from(args.publicInputsBytes);
    } else if (args.proof && args.publicSignals) {
      proofPacked = packGroth16ProofBE(args.proof);
      inputsPacked = packPublicSignalsLE(args.publicSignals);
    } else {
      throw new Error(
        "submitShieldedDepositAtomic: provide (proofBytes, publicInputsBytes) OR (proof, publicSignals)"
      );
    }

    const accounts = {
      // core state
      payer,
      tree: treePda,
      rootCache: rootCachePda,
      depositMarker: depositMarkerPda,

      // token side
      vaultPda: vaultOwnerPda,
      vaultTokenAccount,
      tokenMint: args.mint,

      // programs / sysvars
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    };

    const run = () =>
      (this.program as any).methods
        .shieldedDepositAtomic(depositHashBytes, proofPacked, inputsPacked)
        .accountsPartial(accounts)
        .preInstructions(preIxs)
        .rpc();

    try {
      return await run();
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (m.includes("insufficient lamports") || m.includes("custom program error: 0x1")) {
        await this.ensurePayerFunds(minLamportsBump(minNeeded));
        return await run();
      }
      if (m.includes("Simulation failed")) {
        throw wrapErr(
          "Shielded deposit failed during token prep (requires: TransferChecked → Memo in the same tx as the program call; ATA creates, root_cache init, and wSOL wrap happen in a separate setup tx)",
          e
        );
      }
      throw wrapErr("Shielded deposit failed", e);
    }
  }
}

function minLamportsBump(x: number) { return x + 80_000_000; }
