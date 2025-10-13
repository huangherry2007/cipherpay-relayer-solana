/* ESM */
// src/services/solana-relayer.ts
import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import fs from "node:fs";
import idl from "@/idl/cipherpay_anchor.json" with { type: "json" };
import TxManager from "@/solana/tx-manager.js";

// DB + Merkle store
import { getPool } from "@/services/db/mysql.js";
import {
  MySqlMerkleStore,
  type DepositCompletedEvent,
} from "@/services/merkle/stores/mysql-merkle-store.js";

type AnyIdl = Record<string, any>;
const TREE_ID = Number(process.env.MERKLE_TREE_ID ?? 1);

function makeProvider(): AnchorProvider {
  const url =
    process.env.ANCHOR_PROVIDER_URL ||
    process.env.SOLANA_URL ||
    "http://127.0.0.1:8899";

  const walletPath =
    process.env.ANCHOR_WALLET ||
    `${process.env.HOME}/.config/solana/id.json`;

  const secret = Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf8")));
  const kp = web3.Keypair.fromSecretKey(secret);

  const connection = new web3.Connection(url, "confirmed");
  const wallet = new anchor.Wallet(kp);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function makeProgram(provider: AnchorProvider): Program {
  const idlObj = idl as AnyIdl;
  const programIdStr: string = process.env.PROGRAM_ID || idlObj.address;
  if (!programIdStr) throw new Error("PROGRAM_ID not set and IDL.address missing");
  if (idlObj.address !== programIdStr) idlObj.address = programIdStr;
  return new Program(idlObj as unknown as anchor.Idl, provider);
}

export type DepositBinArgs = {
  amount: bigint;
  tokenMint: string;         // base58
  proofBytes: Buffer;        // 256 bytes
  publicInputsBytes: Buffer; // 7*32 bytes
};

type SubmitWithinOpts = {
  /** Max wall time for one attempt (ms). Default 25_000 */
  timeoutMs?: number;
  /** Number of retries after the first attempt (0 = no retries). Default 1 */
  retries?: number;
  /** Called before each attempt (attempt is 1-based). */
  onAttempt?: (attempt: number) => void | Promise<void>;
};

/* ------------------------------- helpers ------------------------------- */

const pick = (obj: any, labels: string[]) => {
  for (const k of labels) {
    if (obj != null && obj[k] != null) return obj[k];
  }
  return undefined;
};

const mustPick = (obj: any, labels: string[], ctx: string) => {
  const v = pick(obj, labels);
  if (v == null) {
    // helpful debug: show actual keys we received
    const keys = obj && typeof obj === "object" ? Object.keys(obj) : [];
    throw new Error(
      `event field missing (${ctx}): tried ${labels.join(
        "|"
      )}; available keys: [${keys.join(", ")}]`
    );
  }
  return v;
};

const normalizeMint = (m: any): string => {
  if (m?.toBase58) return m.toBase58();
  if (m instanceof web3.PublicKey) return m.toBase58();
  if (typeof m === "string") return m;
  return new web3.PublicKey(m).toBase58();
};

/* Accept both snake_case and camelCase for every field */
const MAP = {
  deposit_hash: ["deposit_hash", "depositHash"],
  owner_cipherpay_pubkey: ["owner_cipherpay_pubkey", "ownerCipherpayPubkey"],
  commitment: ["commitment", "new_commitment", "newCommitment"],
  old_merkle_root: ["old_merkle_root", "oldMerkleRoot"],
  new_merkle_root: ["new_merkle_root", "merkle_root", "newMerkleRoot", "merkleRoot"],
  next_leaf_index: ["next_leaf_index", "nextLeafIndex"],
  mint: ["mint"],
};

const toPayload = (raw: any): DepositCompletedEvent => {
  const deposit_hash = mustPick(raw, MAP.deposit_hash, "deposit_hash") as Uint8Array;
  const owner_cipherpay_pubkey = mustPick(raw, MAP.owner_cipherpay_pubkey, "owner_cipherpay_pubkey") as Uint8Array;
  const commitment = mustPick(raw, MAP.commitment, "commitment") as Uint8Array;
  const old_merkle_root = mustPick(raw, MAP.old_merkle_root, "old_merkle_root") as Uint8Array;
  const new_merkle_root = mustPick(raw, MAP.new_merkle_root, "new_merkle_root") as Uint8Array;
  const next_leaf_index = Number(mustPick(raw, MAP.next_leaf_index, "next_leaf_index"));
  const mintRaw = mustPick(raw, MAP.mint, "mint");

  return {
    deposit_hash,
    owner_cipherpay_pubkey,
    commitment,
    old_merkle_root,
    new_merkle_root,
    next_leaf_index,
    mint: normalizeMint(mintRaw),
  };
};

/* ------------------------------ main class ----------------------------- */

class SolanaRelayer {
  readonly provider: AnchorProvider;
  readonly program: Program;
  readonly txm: TxManager;

  private store: MySqlMerkleStore | null = null;
  private depositListenerId: number | null = null;
  private onLogsSubId: number | null = null;

  constructor() {
    this.provider = makeProvider();
    this.program = makeProgram(this.provider);
    this.txm = new TxManager({
      program: this.program,
      provider: this.provider,
      connection: this.provider.connection,
    });
  }

  /** Submit a shielded deposit using raw proof/public input binaries. */
  async submitDepositWithBin(args: DepositBinArgs) {
    const mint = new web3.PublicKey(args.tokenMint);
    const sig = await this.txm.submitShieldedDepositAtomicBytes({
      mint,
      amount: args.amount,
      proofBytes: args.proofBytes,
      publicInputsBytes: args.publicInputsBytes,
    });
    return { signature: sig };
  }

  /**
   * Submit a shielded deposit but enforce a wall-time budget and optional retries.
   * Wraps `submitDepositWithBin` in a timeout + simple retry policy.
   */
  async submitDepositWithin(
    args: DepositBinArgs,
    opts: SubmitWithinOpts = {}
  ): Promise<{ signature: string }> {
    const timeoutMs = opts.timeoutMs ?? 25_000;
    const retries = Math.max(0, opts.retries ?? 1);

    const attemptOnce = async (attempt: number) => {
      await opts.onAttempt?.(attempt);

      const to = new Promise<never>((_, rej) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          rej(new Error(`submitDepositWithin: attempt ${attempt} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
      });

      return Promise.race([
        this.submitDepositWithBin(args),
        to,
      ]) as Promise<{ signature: string }>;
    };

    let lastErr: unknown = null;
    for (let i = 1; i <= 1 + retries; i++) {
      try {
        return await attemptOnce(i);
      } catch (e) {
        lastErr = e;
        if (i <= retries) await new Promise((r) => setTimeout(r, 500 * i));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  // ---------- Event plumbing ----------
  async startListeners() {
    if (!this.store) {
      const pool = await getPool();
      this.store = new MySqlMerkleStore(pool);
    }

    const idlEvents = (this.program.idl as any)?.events?.map((e: any) => e.name) || [];
    console.log("[events] IDL Events:", idlEvents);

    // (A) Robust path: parse events from logs with Anchor's EventParser
    if (this.onLogsSubId === null) {
      const parser = new anchor.EventParser(this.program.programId, this.program.coder);
      this.onLogsSubId = this.provider.connection.onLogs(
        this.program.programId,
        async (l) => {
          try {
            console.log("[onLogs] signature:", (l as any).signature, "slot:", (l as any).slot);
            for (const m of l.logs) console.log("   ", m);

            for (const ev of parser.parseLogs(l.logs) ?? []) {
              if (ev.name === "depositCompleted" || ev.name === "DepositCompleted") {
                const payload = toPayload(ev.data);
                await this.store!.recordDepositCompleted(TREE_ID, payload);
                console.info("[events] DepositCompleted persisted from onLogs", {
                  leafIndex: payload.next_leaf_index,
                  mint: payload.mint,
                });
              }
            }
          } catch (e: any) {
            console.error("[onLogs] parse/persist error:", e?.message || e);
          }
        },
        "processed"
      );
      console.log("[events] onLogs parser attached:", this.onLogsSubId);
    }

    // (B) Optional: keep Anchor's addEventListener too
    if (this.depositListenerId === null) {
      this.depositListenerId = await this.program.addEventListener(
        "DepositCompleted",
        async (ev: any, slot: number, sig?: string) => {
          try {
            const payload = toPayload(ev);
            await this.store!.recordDepositCompleted(TREE_ID, payload);
            console.info("[events] DepositCompleted persisted (anchor listener)", { slot, sig });
          } catch (e: any) {
            console.error("[events] DepositCompleted handler error:", e?.message || e);
          }
        },
        "processed"
      );
      console.log("[events] DepositCompleted listener started:", this.depositListenerId);
    }
  }

  async stopListeners() {
    if (this.depositListenerId !== null) {
      await this.program.removeEventListener(this.depositListenerId);
      this.depositListenerId = null;
      console.log("[events] DepositCompleted listener stopped");
    }
    if (this.onLogsSubId !== null) {
      await this.provider.connection.removeOnLogsListener(this.onLogsSubId);
      this.onLogsSubId = null;
      console.log("[events] onLogs parser detached");
    }
  }
}

export const solanaRelayer = new SolanaRelayer();

// Auto-start listeners (keep this)
if (process.env.RELAYER_AUTO_LISTEN !== "0") {
  solanaRelayer.startListeners().catch((e) => {
    console.error("[events] failed to start listeners:", e?.message || e);
  });
}
