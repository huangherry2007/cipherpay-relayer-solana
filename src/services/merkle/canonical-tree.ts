// src/services/merkle/canonical-tree.ts
import { MerkleStore } from "@/services/merkle/stores/mysql-merkle-store.js";

export class CanonicalTree {
  constructor(public store: MerkleStore) {}

  static async create(store: MerkleStore): Promise<CanonicalTree> {
    // ensure root exists (will derive zero-root if missing)
    await store.getRoot();
    return new CanonicalTree(store);
  }

  async getRoot(): Promise<{ root: Buffer; nextIndex: number }> {
    const root = await this.store.getRoot();
    const nextIndex = await this.store.getNextIndex();
    return { root, nextIndex };
  }

  async append(fe: bigint): Promise<{ index: number; root: Buffer }> {
    const { index, root } = await this.store.appendAndRecompute(fe);
    // also push into roots table (optional telemetry)
    // await this.store.pushRoot(le32ToBigInt(root));
    return { index, root };
  }

  async getProofByIndex(index: number) {
    return this.store.getProofByIndex(index);
  }

  async getProofByCommitment(fe: bigint) {
    const idx = await this.store.findLeafIndexByCommitment(fe);
    if (idx == null) throw new Error("commitment not found");
    return this.getProofByIndex(idx);
  }
}
