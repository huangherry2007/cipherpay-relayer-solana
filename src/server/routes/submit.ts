/* ESM */
import { Router } from "express";
import { ProofVerifier } from "@/zk/proof-verifier.js";
import { solanaRelayer } from "@/services/solana-relayer.js";

// --- BN254 prime and helpers (mirror circuits converter) ---
const FQ =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function asBig(v: any): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") {
    const s = v.trim();
    return s.startsWith("0x") || s.startsWith("0X") ? BigInt(s) : BigInt(s);
  }
  if (Array.isArray(v) && v.length === 1) return asBig(v[0]);
  throw new Error(`Cannot parse BigInt from: ${JSON.stringify(v)}`);
}
function normFq(x: any): bigint {
  let n = asBig(x) % FQ;
  if (n < 0n) n += FQ;
  return n;
}
function le32(x: any): Buffer {
  let v = normFq(x);
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}
function encG1(p: any): Buffer {
  // accept [x,y,*] or {x,y}
  const arr = Array.isArray(p) ? p : [p.x, p.y];
  return Buffer.concat([le32(arr[0]), le32(arr[1])]);
}
function encG2(p: any): Buffer {
  // IMPORTANT: keep pairs **as they come** (this matches your working converter)
  // Accept [[x0,x1],[y0,y1], ...] or flat [x0,x1,y0,y1] or {x:[..],y:[..]}
  let x0, x1, y0, y1;
  if (Array.isArray(p)) {
    if (p.length === 4 && !Array.isArray(p[0])) {
      [x0, x1, y0, y1] = p;
    } else if (Array.isArray(p[0]) && Array.isArray(p[1])) {
      [x0, x1] = p[0];
      [y0, y1] = p[1];
    } else {
      throw new Error(`Unrecognized G2 shape: ${JSON.stringify(p)}`);
    }
  } else if (p && typeof p === "object" && p.x && p.y) {
    [x0, x1] = p.x;
    [y0, y1] = p.y;
  } else {
    throw new Error(`Unrecognized G2 shape: ${JSON.stringify(p)}`);
  }
  return Buffer.concat([le32(x0), le32(x1), le32(y0), le32(y1)]);
}
function proofJsonToBin(proof: any): Buffer {
  if (!proof?.pi_a || !proof?.pi_b || !proof?.pi_c) {
    throw new Error("Malformed proof JSON");
  }
  return Buffer.concat([encG1(proof.pi_a), encG2(proof.pi_b), encG1(proof.pi_c)]);
}
function publicsToBin(publicSignals: any[]): Buffer {
  return Buffer.concat(publicSignals.map(le32));
}
function slice32(buf: Buffer, i: number): Buffer {
  const o = i * 32;
  return buf.subarray(o, o + 32);
}
function hexLE32(buf: Buffer): string {
  return Buffer.from(buf).toString("hex");
}

export const submit = Router();

// POST /api/v1/submit/deposit
submit.post("/deposit", async (req, res) => {
  const requestId = (req as any).requestId || "";
  try {
    console.info(
      JSON.stringify({
        level: "info",
        component: "app",
        requestId,
        method: "POST",
        path: "/api/v1/submit/deposit",
        ip: req.ip,
        msg: "Deposit operation initiated",
      })
    );

    const {
      amount,
      tokenMint,
      proof,            // snarkjs JSON (preferred path)
      publicSignals,    // array of decimal strings
      // optional client-provided BIN (we'll still re-derive from JSON if given)
      proofBytes,
      publicInputsBytes,
    } = req.body || {};

    if (!amount || !tokenMint) {
      return res.status(400).json({ ok: false, error: "BadRequest", message: "amount and tokenMint required" });
    }

    let proofBin: Buffer;
    let publicsBin: Buffer;

    if (proof && publicSignals) {
      // 1) local verify (unless explicitly skipped)
      if (process.env.SKIP_LOCAL_VK !== "1") {
        const pv = new ProofVerifier();
        await pv.verify("deposit", proof, publicSignals);
      }

      // 2) JSON → BIN using the exact same encoding as your working converter
      proofBin   = proofJsonToBin(proof);
      publicsBin = publicsToBin(publicSignals);
    } else if (proofBytes && publicInputsBytes) {
      // allow clients to submit BIN directly (hex/base64/Buffer)
      proofBin   = Buffer.isBuffer(proofBytes) ? proofBytes : Buffer.from(proofBytes, proofBytes.startsWith("0x") ? "hex" : "base64");
      publicsBin = Buffer.isBuffer(publicInputsBytes) ? publicInputsBytes : Buffer.from(publicInputsBytes, publicInputsBytes.startsWith("0x") ? "hex" : "base64");
    } else {
      return res.status(400).json({ ok: false, error: "BadRequest", message: "Provide (proof, publicSignals) or (proofBytes, publicInputsBytes)" });
    }

    if (proofBin.length !== 256) {
      return res.status(400).json({ ok: false, error: "BadProofSize", message: `proofBytes must be 256 bytes, got ${proofBin.length}` });
    }
    if (publicsBin.length !== 7 * 32) {
      return res.status(400).json({ ok: false, error: "BadPublicsSize", message: `publicInputsBytes must be 224 bytes, got ${publicsBin.length}` });
    }

    // Derive deposit hash (publicSignals[5]) in LE hex, same as anchor test
    const depHashLE = hexLE32(slice32(publicsBin, 5));
    console.log({
      proofBytes0_32: hexLE32(slice32(proofBin, 0)),   // for quick eyeballing
      publics5_hash_hex: depHashLE,
    });

    // Relay to Solana (BIN path)
    const out = await solanaRelayer.submitDepositWithBin({
      amount: BigInt(amount),
      tokenMint,
      proofBytes: proofBin,
      publicInputsBytes: publicsBin,
    });

    return res.json({ ok: true, signature: out.signature });
  } catch (e: any) {
    console.error("API Error:", e);
    return res.status(500).json({
      ok: false,
      error: "SolanaTransactionError",
      message: e?.message || String(e),
    });
  }
});
