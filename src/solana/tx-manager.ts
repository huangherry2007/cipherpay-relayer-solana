/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as anchor from "@coral-xyz/anchor";
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
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  createSyncNativeInstruction,
} from "@solana/spl-token";

/* ============================================================================
   Seeds & PDA helpers (must match on-chain program)
============================================================================ */
const TREE_SEED = Buffer.from("tree");
const ROOT_CACHE_SEED = Buffer.from("root_cache");
const VAULT_SEED = Buffer.from("vault");
const DEPOSIT_SEED = Buffer.from("deposit");

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

/* ============================================================================
   Types
============================================================================ */
export type Bytes = Uint8Array | Buffer;

export interface ShieldedDepositArgs {
  depositHash: string | Bytes;     // 32-byte hex or bytes
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
  publicSignals?: string[];

  mint: PublicKey;                 // token mint (use NATIVE_MINT for wSOL)
  amount: bigint | number | BN;    // lamports when mint = NATIVE_MINT
  vaultTokenAccount?: PublicKey;   // pass if you already computed it
  payer?: PublicKey;               // default: provider wallet
}

type AnchorCtx = {
  program: anchor.Program<any>;
  provider: anchor.AnchorProvider;
  connection: Connection;
};

/* ============================================================================
   Small utils
============================================================================ */
function to32BytesHexBytes(x: string | Bytes): Buffer {
  if (typeof x !== "string") {
    if (x.length !== 32) throw new Error("depositHash must be 32 bytes");
    return Buffer.from(x);
  }
  const hex = x.startsWith("0x") ? x.slice(2) : x;
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) throw new Error(`depositHash must be 32 bytes, got ${buf.length}`);
  return buf;
}

function bn(x: number | bigint | BN): BN {
  const isBN = (BN as any).isBN;
  if (typeof isBN === "function" && isBN(x)) return x as BN;
  return new BN(x.toString());
}

function wrapErr(prefix: string, e: unknown) {
  const msg = typeof e === "object" && e && "message" in e ? (e as any).message : String(e);
  const err = new Error(`${prefix}: ${msg}`);
  (err as any).cause = e;
  return err;
}

/* ---- minimal BE32 packers (used only if proofBytes/publicInputsBytes not provided) ---- */
function bigFromStr(s: string): bigint {
  const t = s.trim();
  if (t.startsWith("0x") || t.startsWith("0X")) return BigInt(t);
  return BigInt(t);
}
function be32(n: bigint): Buffer {
  const out = Buffer.alloc(32);
  let x = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & BigInt(0xff));
    x >>= BigInt(8);
  }
  return out;
}
function packPublicSignalsBE(signals: string[]): Buffer {
  return Buffer.concat(signals.map((s) => be32(bigFromStr(s))));
}
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
  private readonly program: anchor.Program<any>;
  private readonly provider: anchor.AnchorProvider;
  private readonly connection: Connection;
  private readonly programId: PublicKey;

  constructor(ctx: AnchorCtx) {
    this.program = ctx.program;
    this.provider = ctx.provider;
    this.connection = ctx.connection;
    this.programId = this.program.programId;
  }

  private async prepareTokenSide(
    payer: PublicKey,
    mint: PublicKey,
    vaultOwnerPda: PublicKey,
    amount: BN
  ): Promise<{ preIxs: TransactionInstruction[]; payerAta: PublicKey; vaultAta: PublicKey }> {
    const preIxs: TransactionInstruction[] = [];

    const payerAta = getAssociatedTokenAddressSync(
      mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAta = getAssociatedTokenAddressSync(
      mint, vaultOwnerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // idempotent ATAs
    preIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payer, payerAta, payer, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        payer, vaultAta, vaultOwnerPda, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    // WSOL: fund ATA then sync
    if (mint.equals(NATIVE_MINT) && amount.gt(new BN(0))) {
      preIxs.push(
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: payerAta, lamports: Number(amount) }),
        createSyncNativeInstruction(payerAta)
      );
    }

    return { preIxs, payerAta, vaultAta };
  }

  private async maybeInitRootCacheIx(rootCachePda: PublicKey, payer: PublicKey) {
    const ai = await this.connection.getAccountInfo(rootCachePda);
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

  async submitShieldedDepositAtomic(args: ShieldedDepositArgs): Promise<string> {
    const payer = args.payer ?? this.provider.wallet.publicKey;

    // PDAs (must match on-chain)
    const treePda = pda([TREE_SEED], this.programId);
    const rootCachePda = pda([ROOT_CACHE_SEED], this.programId);
    const vaultOwnerPda = pda([VAULT_SEED, args.mint.toBuffer()], this.programId);

    const depositHashBytes = to32BytesHexBytes(args.depositHash);
    const depositMarkerPda = pda([DEPOSIT_SEED, depositHashBytes], this.programId);

    // --- compute & ensure funds BEFORE we build the tx ---
    const amount = bn(args.amount);
    const payerAta = getAssociatedTokenAddressSync(
      args.mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAta = getAssociatedTokenAddressSync(
      args.mint, vaultOwnerPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const [payerAtaInfo, vaultAtaInfo] = await Promise.all([
      this.connection.getAccountInfo(payerAta),
      this.connection.getAccountInfo(vaultAta),
    ]);
    const rentForTokenAcc = await this.connection.getMinimumBalanceForRentExemption(165);
    const missingAtas = (payerAtaInfo ? 0 : 1) + (vaultAtaInfo ? 0 : 1);
    const wsolTopUp = args.mint.equals(NATIVE_MINT) ? Number(amount) : 0;

    // buffer covers fees and any small drift
    const buffer = 1_000_000; // 0.001 SOL
    const required = missingAtas * rentForTokenAcc + wsolTopUp + buffer;

    const bal = await this.connection.getBalance(payer);
    if (bal < required) {
      try {
        const sig = await this.connection.requestAirdrop(payer, Math.max(required - bal, 0) + 2_000_000);
        await this.connection.confirmTransaction(sig, "confirmed");
      } catch {
        // ignore if on a cluster without a faucet
      }
    }

    // Token prep (now safe to build)
    const { preIxs, payerAta: payerAta2, vaultAta: vaultAta2 } = await this.prepareTokenSide(
      payer, args.mint, vaultOwnerPda, amount
    );
    const vaultTokenAccount = args.vaultTokenAccount ?? vaultAta2;

    // root_cache lazy init (only if missing)
    const initRootIx = await this.maybeInitRootCacheIx(rootCachePda, payer);
    if (initRootIx) preIxs.unshift(initRootIx);

    // choose packing
    let proofPacked: Buffer;
    let inputsPacked: Buffer;
    if (args.proofBytes && args.publicInputsBytes) {
      proofPacked = Buffer.from(args.proofBytes);
      inputsPacked = Buffer.from(args.publicInputsBytes);
    } else if (args.proof && args.publicSignals) {
      proofPacked = packGroth16ProofBE(args.proof);
      inputsPacked = packPublicSignalsBE(args.publicSignals);
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

    try {
      // IDL (3 args): deposit_hash, proof_bytes, public_inputs_bytes
      const sig = await (this.program as any).methods
        .shieldedDepositAtomic(depositHashBytes, proofPacked, inputsPacked)
        .accountsPartial(accounts)
        .preInstructions(preIxs)
        .rpc();
      return sig;
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (
        m.includes("Attempt to debit an account but found no record of a prior credit") ||
        m.includes("Simulation failed")
      ) {
        throw wrapErr(
          "Shielded deposit failed during token prep (ensure WSOL ATA got a SystemProgram.transfer before SyncNative)",
          e
        );
      }
      throw wrapErr("Shielded deposit failed", e);
    }
  }
}
