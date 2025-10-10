/* tests/e2e/deposit/deposit_test.ts */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { H } from "@/services/merkle/poseidon.js";
import dotenv from "dotenv";

dotenv.config();

// -------- helpers --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = process.env.DASHBOARD_TOKEN || process.env.API_TOKEN || "supersecret"; // if your prepare/submit require Bearer
const HMAC_KEY_ID = process.env.API_KEY_ID || "";     // if your makeAuthMiddleware expects HMAC-style auth
const HMAC_SECRET = process.env.API_KEY_SECRET || ""; // used to sign raw body (see capture in server.ts)
const MINT_ADDRESS =
  process.env.TEST_MINT ||
  process.env.USDC_MINT ||
  "So11111111111111111111111111111111111111112"; // Native SOL (wrapped SOL)

// proofs/deposit paths (convention)
const PROOFS_DIR = process.env.DEPOSIT_PROOFS_DIR ||
  path.resolve(__dirname, "./proof");
const EXAMPLE_INPUT = path.join(PROOFS_DIR, "example_input.json"); // your file
const WASM_PATH = process.env.DEPOSIT_WASM || path.join(PROOFS_DIR, "deposit.wasm");
const ZKEY_PATH = process.env.DEPOSIT_ZKEY || path.join(PROOFS_DIR, "deposit_final.zkey");

function hasArtifacts(): boolean {
  return fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH);
}

function hmacHeaders(raw: Buffer) {
  // Mirror your makeAuthMiddleware if it’s HMAC-based. Adjust header names to match your middleware.
  if (!HMAC_SECRET || !HMAC_KEY_ID) return {};
  const sig = crypto.createHmac("sha256", HMAC_SECRET).update(raw).digest("hex");
  return {
    "X-Api-Key": HMAC_KEY_ID,
    "X-Api-Signature": sig,
  };
}

function bearer() {
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
}

function hex32(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

async function httpJson<T>(url: string, body: any): Promise<T> {
  const raw = Buffer.from(JSON.stringify(body));
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...bearer(),
      ...hmacHeaders(raw),
    },
    body: raw,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
  }
  return (await res.json()) as T;
}

async function httpGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { ...bearer() } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
  }
  return (await res.json()) as T;
}

function toDecimalIfHex(x: any): any {
  if (typeof x === "string") {
    const s = x.trim().toLowerCase();
    // allow 0x-prefixed or bare 64-hex; convert to decimal string
    if (/^0x[0-9a-f]+$/.test(s)) return BigInt(s).toString();
    if (/^[0-9a-f]{64}$/.test(s)) return BigInt("0x" + s).toString();
    // already decimal?
    if (/^[0-9]+$/.test(s)) return s;
    // small hex bytes like "00", "1a" etc.
    if (/^[0-9a-f]+$/.test(s)) return BigInt("0x" + s).toString();
    return s;
  }
  if (typeof x === "number") return x.toString();          // keep as decimal string
  if (typeof x === "bigint") return x.toString();          // decimal
  if (Array.isArray(x)) return x.map(toDecimalIfHex);
  if (x && typeof x === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(x)) out[k] = toDecimalIfHex(v);
    return out;
  }
  return x;
}

/** Try to build a Groth16 proof with snarkjs if artifacts exist. */
async function generateGroth16Proof(
  inputSignals: any
): Promise<null | { proof: any; publicSignals: string[] }> {
  if (!hasArtifacts()) return null;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const snarkjs = await import("snarkjs");
  const { groth16 } = snarkjs as any;

  const normalized = toDecimalIfHex(inputSignals);

  console.log("inputSignals", inputSignals);

  const { proof, publicSignals } = await groth16.fullProve(
    normalized,
    WASM_PATH,
    ZKEY_PATH
  );

  return { proof, publicSignals: (publicSignals as any[]).map(String) };
}

// --- helpers to parse field inputs ---
function toBig(x: string | number | bigint): bigint {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") return BigInt(x);
  const s = x.trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return BigInt(s);
  if (/^[0-9a-f]{64}$/i.test(s)) return BigInt("0x" + s); // 32-byte hex
  if (/^[0-9]+$/.test(s)) return BigInt(s);
  throw new Error(`Cannot parse field element from: ${x}`);
}

// -------- test --------
describe("E2E: deposit strict-sync flow", () => {
  let example: any;

  beforeAll(() => {
    const raw = fs.readFileSync(EXAMPLE_INPUT, "utf8");
    example = JSON.parse(raw);
  });

  it("prepares, (optionally) proves, and submits a deposit", async () => {
    const ownerWalletPubKey = toBig(example.ownerWalletPubKey);
    const ownerWalletPrivKey = toBig(example.ownerWalletPrivKey);
    const amount = toBig(example.amount);
    const nonce = toBig(example.nonce);
    const tokenId = toBig(example.tokenId);
    const memo = toBig(example.memo);


    // 1) Generate a commitment (client-side)
    // For now we treat example_input.json’s fields as the canonical source.
    // If you have a specific note commitment formula, compute here (Poseidon).
    // We just ensure it's a bigint-like decimal string.
    const ownerCipherPayPubKey = await H(ownerWalletPubKey, ownerWalletPrivKey);
    const commitment = (await H(amount, ownerCipherPayPubKey, nonce, tokenId, memo)).toString();


    // 2) Call prepare/deposit to get strict-sync zero path at nextIndex
    type PrepareResp = {
      merkleRoot: string;
      nextLeafIndex: number;
      inPathElements: string[];
      inPathIndices: number[];
    };
    const prep = await httpJson<PrepareResp>(
      `${BASE_URL}/api/v1/prepare/deposit`,
      { commitment }
    );

    expect(prep).toBeTruthy();
    expect(Array.isArray(prep.inPathElements)).toBe(true);
    expect(Array.isArray(prep.inPathIndices)).toBe(true);
    expect(typeof prep.nextLeafIndex).toBe("number");
    expect(typeof prep.merkleRoot).toBe("string");

    // Poseidon(ownerWalletPrivKey, ownerWalletPubKey, amount, nonce) -> decimal string
    const depositHashDec = (await H(ownerCipherPayPubKey, amount, nonce)).toString();

    // 3) Build circuit input signals for deposit
    // Map from your circuit’s expected inputs.
    // Common fields (adjust names to your circuit if needed):
    const inputSignals: Record<string, any> = {
      ownerWalletPubKey: example.OwnerWalletPubKey ?? "0",
      ownerWalletPrivKey: example.OwnerWalletPrivKey ?? "0",
      randomness: example.randomness ?? "0",
      tokenId: example.tokenId ?? "0",
      memo: example.memo ?? "0",
      amount: example.amount ?? 100,
      nonce: example.nonce ?? 0,

      // strict-sync path to ZERO at nextIndex (from /prepare)
      inPathElements: prep.inPathElements,
      inPathIndices: prep.inPathIndices,
      nextLeafIndex: prep.nextLeafIndex,

      // You may also want to bind merkleRoot explicitly
      oldMerkleRoot: prep.merkleRoot,

      // ✅ computed binding
      depositHash: depositHashDec,
    };

    // 4) Try proving locally (if artifacts exist). If not, we still move on
    // and expect your server to verify with its own vkeys (or skip in dev).
    let proof: any = null;
    let publicSignals: string[] = [];
    if (hasArtifacts()) {
      const out = await generateGroth16Proof(inputSignals);
      expect(out).toBeTruthy();
      proof = out!.proof;
      publicSignals = out!.publicSignals;
    } else {
      console.warn(
        `[deposit e2e] deposit.wasm or .zkey missing at ${WASM_PATH} / ${ZKEY_PATH}; skipping local proof generation.`
      );
    }

    // 5) Build submit payload
    // Server’s submit route typically needs:
    //  - depositHash (hex or decimal) — if your circuit exports it in publicSignals, prefer that.
    //  - commitment (new commitment) — again, if circuit exports, use that value.
    //  - proof + publicSignals (snarkjs JSON)
    //  - amount, mint address
    //
    // If your circuit exports "depositHash" and "newCommitment" in publicSignals,
    // you can fish them out here. Otherwise we fall back to example/commitment placeholders.
    const depHashHex = BigInt(publicSignals[1]).toString(16).padStart(64, "0");  // per your circuit order
    const commitmentHex = BigInt(publicSignals[2]).toString(16).padStart(64, "0");
    
    const submitBody = {
      operation: "deposit",
      amount: example.amount ?? 100,
      tokenMint: MINT_ADDRESS,      // <- set to a real SPL mint for local dev
      proof,
      publicSignals,
      depositHash: depHashHex,
      commitment: commitmentHex,
      memo: example.memo ?? 0,
    };

    console.log("submitBody", submitBody);

    // If no proof artifacts and your server *requires* proof, we skip the submit step.
    if (!proof) {
      console.warn(
        "[deposit e2e] No proof generated. Skipping /submit; set DEPOSIT_WASM/DEPOSIT_ZKEY to enable full E2E."
      );
      return;
    }

    // 6) Submit
    type SubmitResp = { signature: string; txid?: string; txSig?: string; ok?: boolean };
    const result = await httpJson<SubmitResp>(
      `${BASE_URL}/api/v1/submit/deposit`,
      submitBody
    );

    // 7) Assert we got a tx signature back
    expect(result).toBeTruthy();
    const sig = (result.signature || result.txSig || result.txid || "").toString();
    expect(sig.length).toBeGreaterThan(20);
    // (Optional) you could poll a /tx-status endpoint if you have one
    // or sleep & re-query dashboard metrics for a success increment.
  },
  120_000); 
});
