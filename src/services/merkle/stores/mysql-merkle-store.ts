// src/services/merkle/stores/mysql-merkle-store.ts
import { Pool } from "mysql2/promise";
import { bigIntToLe32, feHex, le32ToBigInt } from "@/utils/bytes.js";
import { H2, zeros } from "@/services/merkle/poseidon.js";

export interface MerkleStore {
  treeId: number;
  getDepth(): Promise<number>;
  getNextIndex(): Promise<number>;
  setNextIndex(next: number): Promise<void>;
  getRoot(): Promise<Buffer>;
  setRoot(feBig: bigint): Promise<void>;
  getLeaf(index: number): Promise<Buffer | null>;
  putLeaf(index: number, feBig: bigint): Promise<void>;
  putNode(layer: number, index: number, feBig: bigint): Promise<void>;
  getNode(layer: number, index: number): Promise<Buffer | null>;
  pushRoot(feBig: bigint): Promise<void>;
  findLeafIndexByCommitment(feBig: bigint): Promise<number | null>;
  appendAndRecompute(feLeafBig: bigint): Promise<{ index: number; root: Buffer }>;
  getProofByIndex(index: number): Promise<{ pathElements: Buffer[]; pathIndices: number[] }>;
}

export class MySqlMerkleStore implements MerkleStore {
  constructor(private pool: Pool, public treeId: number) {}

  async getDepth(): Promise<number> {
    const [rows] = await this.pool.query("SELECT v FROM merkle_meta WHERE tree_id=? AND k='depth'", [this.treeId]);
    const v = (rows as any[])[0]?.v as Buffer | undefined;
    if (!v) throw new Error("depth not set");
    return v.readUInt8(0);
  }

  async getNextIndex(): Promise<number> {
    const [rows] = await this.pool.query("SELECT v FROM merkle_meta WHERE tree_id=? AND k='next_index'", [this.treeId]);
    const v = (rows as any[])[0]?.v as Buffer | undefined;
    if (!v) return 0;
    // v is u64 LE in VARBINARY
    return Number(v.readBigUInt64LE(0));
  }

  async setNextIndex(next: number): Promise<void> {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(next), 0);
    await this.pool.query(
      "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?, 'next_index', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [this.treeId, buf],
    );
  }

  async getRoot(): Promise<Buffer> {
    // root is nodes at layer=depth index=0, or compute zero-root if empty
    const depth = await this.getDepth();
    const [rows] = await this.pool.query(
      "SELECT fe FROM nodes WHERE tree_id=? AND `layer`=? AND `index`=0",
      [this.treeId, depth],
    );
    const fe = (rows as any[])[0]?.fe as Buffer | undefined;
    if (fe) return fe;
    // compute zero root and cache
    const z = await zeros(depth);
    const root = bigIntToLe32(z[depth]!);
    await this.putNode(depth, 0, z[depth]!);
    return root;
  }

  async setRoot(feBig: bigint): Promise<void> {
    const depth = await this.getDepth();
    await this.putNode(depth, 0, feBig);
  }

  async getLeaf(index: number): Promise<Buffer | null> {
    const [rows] = await this.pool.query(
      "SELECT fe FROM leaves WHERE tree_id=? AND `index`=?",
      [this.treeId, index],
    );
    const r = (rows as any[])[0]?.fe as Buffer | undefined;
    return r ?? null;
  }

  async putLeaf(index: number, feBig: bigint): Promise<void> {
    const fe = bigIntToLe32(feBig);
    await this.pool.query(
      "INSERT INTO leaves(tree_id, `index`, fe, fe_hex) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
      [this.treeId, index, fe, feHex(fe)],
    );
    await this.putNode(0, index, feBig);
  }

  async putNode(layer: number, index: number, feBig: bigint): Promise<void> {
    const fe = bigIntToLe32(feBig);
    await this.pool.query(
      "INSERT INTO nodes(tree_id, `layer`, `index`, fe, fe_hex) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
      [this.treeId, layer, index, fe, feHex(fe)],
    );
  }

  async getNode(layer: number, index: number): Promise<Buffer | null> {
    const [rows] = await this.pool.query(
      "SELECT fe FROM nodes WHERE tree_id=? AND `layer`=? AND `index`=?",
      [this.treeId, layer, index],
    );
    const r = (rows as any[])[0]?.fe as Buffer | undefined;
    return r ?? null;
  }

  async pushRoot(feBig: bigint): Promise<void> {
    const fe = bigIntToLe32(feBig);
    await this.pool.query(
      "INSERT INTO roots(tree_id, fe, fe_hex) VALUES(?,?,?)",
      [this.treeId, fe, feHex(fe)],
    );
  }

  async findLeafIndexByCommitment(feBig: bigint): Promise<number | null> {
    const fe = bigIntToLe32(feBig);
    const [rows] = await this.pool.query(
      "SELECT `index` FROM leaves WHERE tree_id=? AND fe_hex=?",
      [this.treeId, feHex(fe)],
    );
    const idx = (rows as any[])[0]?.index as string | number | undefined;
    return idx == null ? null : Number(idx);
  }

  /**
   * Append a leaf and recompute path up to the root, writing nodes into DB.
   * Returns {index, root}.
   */
  async appendAndRecompute(feLeafBig: bigint): Promise<{ index: number; root: Buffer }> {
    const depth = await this.getDepth();
    const next = await this.getNextIndex();
    await this.putLeaf(next, feLeafBig);

    // climb layers
    let cur = feLeafBig;
    let idx = next;
    for (let layer = 0; layer < depth; layer++) {
      const isLeft = (idx & 1) === 0;
      const leftIdx = isLeft ? idx : idx - 1;
      const rightIdx = isLeft ? idx + 1 : idx;

      const leftBuf = await this.getNode(layer, leftIdx);
      const rightBuf = await this.getNode(layer, rightIdx);
      const left = leftBuf ? le32ToBigInt(leftBuf) : (await zeros(layer))[0]!;
      const right = rightBuf ? le32ToBigInt(rightBuf) : (await zeros(layer))[0]!;

      const parent = await H2(left, right);
      const parentIndex = idx >> 1;

      await this.putNode(layer + 1, parentIndex, parent);

      cur = parent;
      idx = parentIndex;
    }

    await this.setNextIndex(next + 1);
    const rootBuf = await this.getRoot();
    return { index: next, root: rootBuf };
  }

  /**
   * Compute membership proof for leaf index: path elements + indices.
   * All nodes are read from DB; missing nodes are treated as zeros.
   */
  async getProofByIndex(index: number): Promise<{ pathElements: Buffer[]; pathIndices: number[] }> {
    const depth = await this.getDepth();
    const outElems: Buffer[] = [];
    const outBits: number[] = [];
    let idx = index;
    for (let layer = 0; layer < depth; layer++) {
      const isLeft = (idx & 1) === 0;
      const sibIndex = isLeft ? idx + 1 : idx - 1;
      const sibBuf = await this.getNode(layer, sibIndex);
      const sib = sibBuf ?? bigIntToLe32((await zeros(layer))[0]!);
      outElems.push(sib);
      outBits.push(isLeft ? 0 : 1);
      idx >>= 1;
    }
    return { pathElements: outElems, pathIndices: outBits };
  }
}
