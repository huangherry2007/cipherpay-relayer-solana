import type { Pool, PoolConnection } from "mysql2/promise";

/**
 * Canonical Merkle tree backed by MySQL tables:
 *  - merkle_meta(tree_id, k, v VARBINARY)
 *  - leaves(tree_id, leaf_index, fe VARBINARY(32), fe_hex)
 *  - nodes(tree_id, node_layer, node_index, fe VARBINARY(32), fe_hex)
 *  - roots(tree_id, slot_index, fe VARBINARY(32), fe_hex)
 *
 * DB updates happen ONLY after confirmed on-chain events (e.g. DepositCompleted).
 */

type ApplyDepositArgs = {
  index: number;      // next_leaf_index from event
  commitment: Buffer; // 32B (BE)
  oldRoot: Buffer;    // 32B (BE)
  newRoot: Buffer;    // 32B (BE)
};

// ---- Poseidon helpers (lazy single build) ----
let _hash2Promise: Promise<(a: Buffer, b: Buffer) => Buffer> | null = null;

async function getHash2(): Promise<(a: Buffer, b: Buffer) => Buffer> {
  if (_hash2Promise) return _hash2Promise;
  _hash2Promise = (async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import("circomlibjs");
    const m = (mod as any) || {};
    let poseidon: any;
    if (typeof m.poseidon === "function") poseidon = m.poseidon;
    else if (typeof m.buildPoseidon === "function") poseidon = await m.buildPoseidon();
    else if (typeof m.buildPoseidonOpt === "function") poseidon = await m.buildPoseidonOpt();
    else throw new Error("circomlibjs: poseidon not found");

    const F = poseidon.F || poseidon.getField?.();
    if (!F) throw new Error("circomlibjs: field F not found");

    const feFromBufBE = (b: Buffer) => BigInt("0x" + b.toString("hex"));
    const buf32FromFe = (fe: any) => {
      const n: bigint = typeof fe === "bigint" ? fe : BigInt(F.toObject(fe));
      return Buffer.from(n.toString(16).padStart(64, "0"), "hex");
    };
    return (a: Buffer, b: Buffer) => buf32FromFe(poseidon([feFromBufBE(a), feFromBufBE(b)]));
  })();
  return _hash2Promise;
}

export class CanonicalTree {
  constructor(
    private pool: Pool,
    private treeId: number,
    private depthHint?: number // optional; if omitted we read from DB
  ) {}

  // ---------- meta helpers ----------

  private async readMeta(conn: PoolConnection, key: string): Promise<Buffer | undefined> {
    const [rows] = await conn.query(
      "SELECT v FROM merkle_meta WHERE tree_id=? AND k=?",
      [this.treeId, key]
    );
    return (rows as any[])[0]?.v as Buffer | undefined;
  }

  async getDepth(): Promise<number> {
    if (this.depthHint != null) return this.depthHint;
    const conn = await this.pool.getConnection();
    try {
      const v = await this.readMeta(conn, "depth");
      if (!v) throw new Error("merkle_meta.depth missing");
      this.depthHint = v.readUInt8(0);
      return this.depthHint!;
    } finally {
      conn.release();
    }
  }

  /** Current root as Buffer(32). */
  async getRoot(): Promise<Buffer> {
    const conn = await this.pool.getConnection();
    try {
      const v = await this.readMeta(conn, "root");
      if (v?.length === 32) return v;
      const depth = await this.getDepth();
      const zeros = await this.getZeroHashes(depth);
      return zeros[depth];
    } finally {
      conn.release();
    }
  }

  /** Current root and next index (what the *next* append will use). */
  async getRootAndIndex(): Promise<{ root: Buffer; nextIndex: number }> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT k,v FROM merkle_meta WHERE tree_id=? AND k IN ('root','next_index','depth')",
        [this.treeId]
      );
      const map = new Map<string, Buffer>((rows as any[]).map(r => [r.k as string, r.v as Buffer]));
      const depth = map.get("depth")?.readUInt8(0);
      if (depth == null) throw new Error("merkle_meta.depth missing");

      const rootBuf = map.get("root");
      const root =
        rootBuf?.length === 32
          ? rootBuf
          : (await this.getZeroHashes(depth))[depth];

      const next = Number(map.get("next_index")?.readBigUInt64LE(0) ?? 0n);
      return { root, nextIndex: next };
    } finally {
      conn.release();
    }
  }

  /** Set the root directly (rarely used now; prefer applyDepositFromEvent). */
  async setRoot(root: Buffer | bigint | string): Promise<void> {
    const buf =
      Buffer.isBuffer(root)
        ? root
        : typeof root === "bigint"
          ? Buffer.from(root.toString(16).padStart(64, "0"), "hex")
          : Buffer.from(root.replace(/^0x/, ""), "hex");

    const conn = await this.pool.getConnection();
    try {
      await conn.query(
        "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [this.treeId, "root", buf]
      );
      const [rows] = await conn.query(
        "SELECT v FROM merkle_meta WHERE tree_id=? AND k='roots_next_slot'",
        [this.treeId]
      );
      const slot = (rows as any[])[0]?.v?.readUInt8(0) ?? 0;
      await conn.query(
        "INSERT INTO roots(tree_id, slot_index, fe, fe_hex) VALUES(?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
        [this.treeId, slot, buf, buf.toString("hex")]
      );
      const next = (slot + 1) & 0x7f;
      await conn.query(
        "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [this.treeId, "roots_next_slot", Buffer.from([next])]
      );
    } finally {
      conn.release();
    }
  }

  // ---------- zeros cache ----------

  private _zerosByDepth = new Map<number, Buffer[]>();

  private async getZeroHashes(depth: number): Promise<Buffer[]> {
    const cached = this._zerosByDepth.get(depth);
    if (cached) return cached;
    const H2 = await getHash2();
    const z: Buffer[] = new Array(depth + 1);
    z[0] = Buffer.alloc(32, 0);
    for (let i = 1; i <= depth; i++) z[i] = H2(z[i - 1], z[i - 1]);
    this._zerosByDepth.set(depth, z);
    return z;
  }

  // ---------- read-only path helpers ----------

  /**
   * Path to root for a given leaf index (sibling elements bottom-up).
   * Uses DB nodes/leaves with zero-hash fallback if a node row is missing.
   */
  async getPathByIndex(index: number): Promise<{ pathElements: Buffer[]; pathIndices: number[] }> {
    const depth = await this.getDepth();
    const zeros = await this.getZeroHashes(depth);

    const conn = await this.pool.getConnection();
    try {
      const pathElements: Buffer[] = new Array(depth);
      const pathIndices: number[] = new Array(depth);

      let idxAtLevel = index;

      for (let level = 0; level < depth; level++) {
        // sibling index at this level
        const sibIdx = idxAtLevel ^ 1;
        pathIndices[level] = (idxAtLevel & 1) ? 1 : 0;

        let sibVal: Buffer | undefined;

        if (level === 0) {
          const [rows] = await conn.query(
            "SELECT fe FROM leaves WHERE tree_id=? AND leaf_index=?",
            [this.treeId, sibIdx]
          );
          sibVal = (rows as any[])[0]?.fe as Buffer | undefined;
          if (!sibVal) sibVal = zeros[0];
        } else {
          const [rows] = await conn.query(
            "SELECT fe FROM nodes WHERE tree_id=? AND node_layer=? AND node_index=?",
            [this.treeId, level, sibIdx]
          );
          sibVal = (rows as any[])[0]?.fe as Buffer | undefined;
          if (!sibVal) sibVal = zeros[level];
        }

        pathElements[level] = sibVal;
        idxAtLevel >>= 1;
      }

      return { pathElements, pathIndices };
    } finally {
      conn.release();
    }
  }

  /**
   * Locate a leaf by commitment (BigInt or hex/Buffer elsewhere) and return its path.
   * Expects BE 32-byte encoding in DB (same as applyDepositFromEvent).
   */
  async getPathByCommitment(commitment: bigint): Promise<{ pathElements: Buffer[]; pathIndices: number[]; index: number }> {
    const hex = commitment.toString(16).padStart(64, "0");
    const buf = Buffer.from(hex, "hex");

    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query(
        "SELECT leaf_index FROM leaves WHERE tree_id=? AND fe=? LIMIT 1",
        [this.treeId, buf]
      );
      const idx = (rows as any[])[0]?.leaf_index as number | undefined;
      if (idx == null) throw new Error("commitment not found");

      const path = await this.getPathByIndex(idx);
      return { ...path, index: idx };
    } finally {
      conn.release();
    }
  }

  // ---------- atomic updater from events ----------

  async applyDepositFromEvent(a: ApplyDepositArgs): Promise<void> {
    const { index, commitment, oldRoot, newRoot } = a;
    const conn = await this.pool.getConnection();

    try {
      await conn.beginTransaction();

      // 1) lock meta and sanity check
      const [metaRows] = await conn.query(
        "SELECT k,v FROM merkle_meta WHERE tree_id=? AND k IN ('next_index','root','depth','roots_next_slot') FOR UPDATE",
        [this.treeId]
      );
      const meta = new Map<string, Buffer>((metaRows as any[]).map(r => [r.k as string, r.v as Buffer]));

      const dbNextIndex = meta.get("next_index")?.readBigUInt64LE(0) ?? 0n;
      const dbRoot      = meta.get("root");
      const dbDepth     = meta.get("depth")?.readUInt8(0);
      if (dbDepth == null) throw new Error("merkle_meta.depth missing");
      if (Number(dbNextIndex) !== index) throw new Error(`next_index mismatch: db=${dbNextIndex} event=${index}`);

      if (!dbRoot) {
        const zeros = await this.getZeroHashes(dbDepth);
        if (zeros[dbDepth].compare(oldRoot) !== 0) throw new Error("old root mismatch on empty tree");
      } else if (dbRoot.compare(oldRoot) !== 0) {
        throw new Error("old root mismatch (db vs event)");
      }

      // 2) write leaf
      await conn.query(
        "INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex) VALUES(?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
        [this.treeId, index, commitment, commitment.toString("hex")]
      );

      // 3) recompute path up to root
      const H2 = await getHash2();
      let curIndex = index;
      let curVal = commitment;

      for (let layer = 1; layer <= dbDepth; layer++) {
        const parentIndex = Math.floor(curIndex / 2);
        const isLeft = (curIndex % 2) === 0;

        let siblingVal: Buffer;

        if (layer === 1) {
          const sibLeafIndex = isLeft ? curIndex + 1 : curIndex - 1;
          const [sibRows] = await conn.query(
            "SELECT fe FROM leaves WHERE tree_id=? AND leaf_index=?",
            [this.treeId, sibLeafIndex]
          );
          siblingVal = (sibRows as any[])[0]?.fe as Buffer | undefined ?? Buffer.alloc(32, 0);
        } else {
          const sibNodeIndex = isLeft ? (curIndex + 1) : (curIndex - 1);
          const [sibRows] = await conn.query(
            "SELECT fe FROM nodes WHERE tree_id=? AND node_layer=? AND node_index=?",
            [this.treeId, layer - 1, sibNodeIndex]
          );
          if ((sibRows as any[]).length === 0) {
            const zeros = await this.getZeroHashes(dbDepth);
            siblingVal = zeros[layer - 1];
          } else {
            siblingVal = (sibRows as any[])[0].fe as Buffer;
          }
        }

        const left  = isLeft ? curVal : siblingVal;
        const right = isLeft ? siblingVal : curVal;
        const parentVal = H2(left, right);

        await conn.query(
          "INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex) VALUES(?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
          [this.treeId, layer, parentIndex, parentVal, parentVal.toString("hex")]
        );

        curIndex = parentIndex;
        curVal = parentVal;
      }

      if (curVal.compare(newRoot) !== 0) throw new Error("recomputed root != event.newRoot (possible race)");

      // 5) bump next_index + persist new root
      const nextBuf = Buffer.alloc(8);
      nextBuf.writeBigUInt64LE(BigInt(index + 1), 0);

      await conn.query(
        "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [this.treeId, "next_index", nextBuf]
      );
      await conn.query(
        "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [this.treeId, "root", newRoot]
      );

      // 6) roots ring
      const slot = meta.get("roots_next_slot")?.readUInt8(0) ?? 0;
      await conn.query(
        "INSERT INTO roots(tree_id, slot_index, fe, fe_hex) VALUES(?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
        [this.treeId, slot, newRoot, newRoot.toString("hex")]
      );
      const bumped = (slot + 1) & 0x7f;
      await conn.query(
        "INSERT INTO merkle_meta(tree_id,k,v) VALUES(?,?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [this.treeId, "roots_next_slot", Buffer.from([bumped])]
      );

      await conn.commit();
    } catch (e) {
      try { await conn?.rollback(); } catch {}
      throw e;
    } finally {
      // conn might be closed by rollback; guard release
      try { conn?.release(); } catch {}
    }
  }
}
