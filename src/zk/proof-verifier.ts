// src/zk/proof-verifier.ts
import * as snarkjs from "snarkjs";
import fs from "fs";
import path from "path";

type Circuit = "deposit" | "transfer" | "withdraw";

export class ProofVerifier {
  private vkeys = new Map<Circuit, any>();
  constructor(private vkeyDir: string) {}

  async load(c: Circuit) {
    if (this.vkeys.has(c)) return this.vkeys.get(c);
    const p = path.join(this.vkeyDir, `${c}_vkey.json`);
    const vk = JSON.parse(fs.readFileSync(p, "utf8"));
    this.vkeys.set(c, vk);
    return vk;
  }

  async verify(circuit: Circuit, proof: any, publicSignals: string[] | bigint[]) {
    const vk = await this.load(circuit);
    // Convert bigint[] to string[] if needed
    const signals = publicSignals.map(s => typeof s === 'bigint' ? s.toString() : s);
    const ok = await snarkjs.groth16.verify(vk, signals, proof);
    if (!ok) throw new Error(`proof verification failed (${circuit})`);
    return true;
  }
}
