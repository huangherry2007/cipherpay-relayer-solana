// src/zk/proof-verifier.ts
import * as snarkjs from "snarkjs";
import depositVKey  from "./circuits/deposit_vkey.json" with { type: "json" };
import transferVKey from "./circuits/transfer_vkey.json" with { type: "json" };
import withdrawVKey from "./circuits/withdraw_vkey.json" with { type: "json" };

const VKEYS = { deposit: depositVKey, transfer: transferVKey, withdraw: withdrawVKey } as const;

export class ProofVerifier {
  async load(c: keyof typeof VKEYS) { return VKEYS[c]; }
  async verify(c: keyof typeof VKEYS, proof: any, publicSignals: (string|bigint)[]) {
    const vk = await this.load(c);
    const signals = publicSignals.map(s => typeof s === "bigint" ? s.toString() : s);
    const ok = await snarkjs.groth16.verify(vk, signals, proof);
    if (!ok) throw new Error(`proof verification failed (${c})`);
    return true;
  }
}
