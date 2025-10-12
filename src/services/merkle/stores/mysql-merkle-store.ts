// Signatures changed to nodeLayer/nodeIndex and leafIndex,
// plus 128-slot ring buffer for roots.

import { Pool } from "mysql2/promise";
import { bigIntToLe32, feHex, le32ToBigInt } from "@/utils/bytes.js";
import { H2, zeros } from "@/services/merkle/poseidon.js";

export interface MerkleStore {
  // meta
  getDepth(treeId: number): Promise<number>;
  setDepth(treeId: number, depth: number): Promise<void>;
  getNextIndex(treeId: number): Promise<number>;
  setNextIndex(treeId: number, next: number): Promise<void>;

  // roots (128 ring buffer)
  getRoot(treeId: number): Promise<Buffer>;
  setRoot(treeId: number, feBig: bigint): Promise<void>;

  // leaves
  getLeaf(treeId: number, leafIndex: number): Promise<Buffer | null>;
  putLeaf(treeId: number, leafIndex: number, feBig: bigint): Promise<void>;

  // internal nodes (>=1)
  putNode(treeId: number, nodeLayer: number, nodeIndex: number, feBig: bigint): Promise<void>;
  getNode(treeId: number, nodeLayer: number, nodeIndex: number): Promise<Buffer | null>;

  // ops
  appendAndRecompute(treeId: number, feBig: bigint): Promise<number>;
  getPathByIndex(treeId: number, leafIndex: number):
    Promise<{ pathElements: Buffer[]; pathIndices: number[] }>;

  /** @deprecated use getPathByIndex */
  getProofByIndex?(treeId: number, leafIndex: number):
    Promise<{ pathElements: Buffer[]; pathIndices: number[] }>;
}

export class MySqlMerkleStore implements MerkleStore {
  constructor(public pool: Pool) {}

// -------- meta ----------
async getDepth(treeId: number): Promise<number> {
  const [rows] = await this.pool.query(
    "SELECT v FROM merkle_meta WHERE tree_id=? AND k='depth'",
    [treeId]
  );
  const v: Buffer | undefined = (rows as any[])[0]?.v;
  if (!v || v.length < 1) {
    throw new Error(
      `Merkle meta 'depth' missing for tree_id=${treeId} — run scripts/init-canonical-tree.js`
    );
  }
  return v.readUInt8(0);
}

async setDepth(treeId: number, depth: number): Promise<void> {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(depth & 0xff, 0);
  await this.pool.query(
    "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?, 'depth', ?) " +
      "ON DUPLICATE KEY UPDATE v=VALUES(v)",
    [treeId, buf]
  );
}

async getNextIndex(treeId: number): Promise<number> {
  const [rows] = await this.pool.query(
    "SELECT v FROM merkle_meta WHERE tree_id=? AND k='next_index'",
    [treeId]
  );
  const v: Buffer | undefined = (rows as any[])[0]?.v;
  if (!v || v.length < 8) {
    // Default to 0 if not initialized (append() code also assumes 0 on first use)
    return 0;
  }
  // stored as u64 LE
  return Number(v.readBigUInt64LE(0));
}

async setNextIndex(treeId: number, next: number): Promise<void> {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(next), 0);
  await this.pool.query(
    "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?, 'next_index', ?) " +
      "ON DUPLICATE KEY UPDATE v=VALUES(v)",
    [treeId, buf]
  );
}


  // --- roots ring buffer helpers (128 slots) ---
  private async getRootsNextSlot(connOrPool: Pool | any, treeId: number): Promise<number> {
    const exec = connOrPool.query ? connOrPool : this.pool;
    const [rows] = await exec.query(
      "SELECT v FROM merkle_meta WHERE tree_id=? AND k='roots_next_slot'",
      [treeId]
    );
    const v = (rows as any[])[0]?.v as Buffer | undefined;
    if (!v) return 0; // default/init
    return Number(v.readUInt8(0)); // 0..255; we’ll mod 128 anyway
  }

  private async setRootsNextSlot(connOrPool: Pool | any, treeId: number, slot: number): Promise<void> {
    const exec = connOrPool.query ? connOrPool : this.pool;
    const buf = Buffer.alloc(1);
    buf.writeUInt8(slot % 128, 0);
    await exec.query(
      "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?, 'roots_next_slot', ?) " +
      "ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [treeId, buf]
    );
  }

  // -------- roots ----------

  /**
   * Returns the current Merkle root.
   * Order of precedence:
   *  1) merkle_meta(tree_id, 'root')        -- source of truth
   *  2) latest entry in roots ring buffer   -- fallback
   *  3) merkle_meta(tree_id, 'zero')        -- fallback if present
   *  4) computed zero-root at configured depth
   */
  async getRoot(treeId: number): Promise<Buffer> {
    // 1) Try merkle_meta.root
    const [metaRows] = await this.pool.query(
      "SELECT v FROM merkle_meta WHERE tree_id = ? AND k = 'root' LIMIT 1",
      [treeId]
    );
    const metaRoot = (metaRows as any[])[0]?.v as Buffer | undefined;
    if (metaRoot && metaRoot.length) return metaRoot;

    // 2) Fallback to ring buffer latest (if any)
    const next = await this.getRootsNextSlot(this.pool, treeId); // 0..127
    const latest = (next + 127) % 128;
    const [rows] = await this.pool.query(
      "SELECT fe FROM roots WHERE tree_id=? AND slot_index=?",
      [treeId, latest]
    );
    const fe = (rows as any[])[0]?.fe as Buffer | undefined;
    if (fe && fe.length) return fe;

    // 3) Fallback to merkle_meta.zero (if present)
    const [zeroRows] = await this.pool.query(
      "SELECT v FROM merkle_meta WHERE tree_id = ? AND k = 'zero' LIMIT 1",
      [treeId]
    );
    const metaZero = (zeroRows as any[])[0]?.v as Buffer | undefined;
    if (metaZero && metaZero.length) return metaZero;

    // 4) Final fallback: compute zero-root from depth
    const depth = await this.getDepth(treeId);
    const zTop = (await zeros(depth))[0]!;
    return bigIntToLe32(zTop);
  }

  /**
   * Persists a new Merkle root:
   *  - Writes into the roots ring buffer (slot = roots_next_slot)
   *  - Upserts merkle_meta(tree_id, 'root') with the same value
   *  - Bumps roots_next_slot atomically
   */
  async setRoot(treeId: number, feBig: bigint): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const feBuf = bigIntToLe32(feBig);

      // 1) Write into ring buffer (roots table)
      const next = await this.getRootsNextSlot(conn, treeId); // 0..127
      await conn.query(
        `INSERT INTO roots(tree_id, slot_index, fe, fe_hex)
        VALUES(?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
        [treeId, next, feBuf, feHex(feBuf)]
      );

      // 2) Upsert current root in merkle_meta (key = 'root')
      await conn.query(
        `INSERT INTO merkle_meta(tree_id, k, v)
        VALUES(?, 'root', ?)
        ON DUPLICATE KEY UPDATE v=VALUES(v)`,
        [treeId, feBuf]
      );

      // 3) Bump ring buffer pointer
      const bumped = (next + 1) % 128;
      await this.setRootsNextSlot(conn, treeId, bumped);

      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  // leaves
  async getLeaf(treeId: number, leafIndex: number): Promise<Buffer | null> {
    const [rows] = await this.pool.query(
      "SELECT fe FROM leaves WHERE tree_id=? AND leaf_index=?",
      [treeId, leafIndex]
    );
    return (rows as any[])[0]?.fe ?? null;
  }

  async putLeaf(treeId: number, leafIndex: number, feBig: bigint): Promise<void> {
    const feBuf = bigIntToLe32(feBig);
    await this.pool.query(
      "INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex) VALUES(?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
      [treeId, leafIndex, feBuf, feHex(feBuf)]
    );
  }

  // -------- internal nodes (>=1) ----------
  async putNode(treeId: number, nodeLayer: number, nodeIndex: number, feBig: bigint): Promise<void> {
    if (nodeLayer === 0) throw new Error("putNode(layer=0) not allowed; use putLeaf");
    const feBuf = bigIntToLe32(feBig);
    await this.pool.query(
      "INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex) VALUES(?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
      [treeId, nodeLayer, nodeIndex, feBuf, feHex(feBuf)]
    );
  }

  async getNode(treeId: number, nodeLayer: number, nodeIndex: number): Promise<Buffer | null> {
    const [rows] = await this.pool.query(
      "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
      [treeId, nodeLayer, nodeIndex]
    );
    return (rows as any[])[0]?.fe ?? null;
  }

  // -------- append & recompute ----------
  async appendAndRecompute(treeId: number, feBig: bigint): Promise<number> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [r] = await conn.query(
        "SELECT v FROM merkle_meta WHERE tree_id=? AND k='next_index' FOR UPDATE",
        [treeId]
      );
      const v = (r as any[])[0]?.v as Buffer | undefined;
      const leafIndex = v ? Number(v.readBigUInt64LE(0)) : 0;
      const depth = await this.getDepth(treeId);

      // write leaf
      const leafBuf = bigIntToLe32(feBig);
      await conn.query(
        "INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex) VALUES(?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
        [treeId, leafIndex, leafBuf, feHex(leafBuf)]
      );

      // climb
      let idx = leafIndex;
      let cur = feBig;
      for (let layer = 0; layer < depth; layer++) {
        const isLeft = (idx & 1) === 0;
        const sibIndex = isLeft ? idx + 1 : idx - 1;

        const [sib] = await conn.query(
          "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
          [treeId, layer, sibIndex]
        );
        const sibBuf: Buffer | undefined = (sib as any[])[0]?.fe;
        const sibBig = sibBuf ? le32ToBigInt(sibBuf) : (await zeros(layer))[0]!;

        const left = isLeft ? cur : sibBig;
        const right = isLeft ? sibBig : cur;

        const parent = await H2(left, right);
        const nodeLayer = layer + 1;
        const nodeIndex = Math.floor(idx / 2);

        await conn.query(
          "INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex) VALUES(?, ?, ?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
          [treeId, nodeLayer, nodeIndex, bigIntToLe32(parent), feHex(bigIntToLe32(parent))]
        );

        cur = parent;
        idx >>= 1;
      }

      // write root into ring buffer + bump pointer
      await this.setRoot(treeId, cur);

      // bump next_index
      const nextBuf = Buffer.alloc(8);
      nextBuf.writeBigUInt64LE(BigInt(leafIndex + 1), 0);
      await conn.query(
        "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?, 'next_index', ?) " +
        "ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [treeId, nextBuf]
      );

      await conn.commit();
      return leafIndex;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  // -------- path ----------
  async getPathByIndex(treeId: number, leafIndex: number) {
    const depth = await this.getDepth(treeId);
    const pathElements: Buffer[] = [];
    const pathIndices: number[] = [];
    let idx = leafIndex;

    for (let layer = 0; layer < depth; layer++) {
      const isLeft = (idx & 1) === 0;
      const sibIndex = isLeft ? idx + 1 : idx - 1;

      const [rows] = await this.pool.query(
        "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
        [treeId, layer, sibIndex]
      );
      const sibFe: Buffer | undefined = (rows as any[])[0]?.fe;
      const sibBuf = sibFe ?? bigIntToLe32((await zeros(layer))[0]!);

      pathElements.push(sibBuf);
      pathIndices.push(isLeft ? 0 : 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }
}
