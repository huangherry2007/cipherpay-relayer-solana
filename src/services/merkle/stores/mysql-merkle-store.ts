// src/services/merkle/stores/mysql-merkle-store.ts
import { Pool } from "mysql2/promise";
import {
  bigIntToBe32,
  be32ToBigInt,
  feHex,
  le32ToBigInt, // still needed to ingest on-chain (LE) events
} from "@/utils/bytes.js";
import { H2, zeros } from "@/services/merkle/poseidon.js";
import dotenv from "dotenv";
dotenv.config();

export type DepositCompletedEvent = {
  deposit_hash: Uint8Array;
  owner_cipherpay_pubkey: Uint8Array;
  commitment: Uint8Array;      // LE32 on-chain (we’ll convert to bigint then store BE)
  old_merkle_root: Uint8Array; // LE32 on-chain
  new_merkle_root: Uint8Array; // LE32 on-chain
  next_leaf_index: number;     // index where commitment was inserted (post-increment)
  mint: string;                // base58
};

export type TransferCompletedEvent = {
  nullifier: Uint8Array;          // LE32 (not used in Merkle updates here, but available)
  out1_commitment: Uint8Array;    // LE32
  out2_commitment: Uint8Array;    // LE32
  enc_note1_hash: Uint8Array;     // LE32 (optional persistence; unused here)
  enc_note2_hash: Uint8Array;     // LE32 (optional persistence; unused here)
  old_merkle_root: Uint8Array;    // LE32
  new_merkle_root1: Uint8Array;   // LE32 (after inserting out1)
  new_merkle_root2: Uint8Array;   // LE32 (after inserting out2) — becomes canonical root
  next_leaf_index: number;        // post-increment by 2 (i.e., prevNext+2)
  mint: string;                   // base58
};

export type WithdrawCompletedEvent = {
  nullifier: Uint8Array;         // LE32
  old_merkle_root: Uint8Array;   // LE32 (root at the time of spend)
  recipient_wallet_pubkey?: Uint8Array; // LE32 (optional, if emitted)
  amount?: Uint8Array;           // LE32 (optional)
  token_id?: Uint8Array;         // LE32 (optional)
  mint: string;                  // base58 (if emitted)
};

export interface MerkleStore {
  // meta
  getDepth(treeId: number): Promise<number>;
  setDepth(treeId: number, depth: number): Promise<void>;
  getNextIndex(treeId: number): Promise<number>;
  setNextIndex(treeId: number, next: number): Promise<void>;

  // roots (128 ring buffer)
  getRoot(treeId: number): Promise<Buffer>;                 // BE32
  setRoot(treeId: number, feBig: bigint): Promise<void>;    // stored as BE32

  // leaves
  getLeaf(treeId: number, leafIndex: number): Promise<Buffer | null>; // BE32
  putLeaf(treeId: number, leafIndex: number, feBig: bigint): Promise<void>; // BE32

  // internal nodes (>=1)
  putNode(treeId: number, nodeLayer: number, nodeIndex: number, feBig: bigint): Promise<void>; // BE32
  getNode(treeId: number, nodeLayer: number, nodeIndex: number): Promise<Buffer | null>;       // BE32

  // ops
  appendAndRecompute(treeId: number, feBig: bigint): Promise<number>;
  getPathByIndex(treeId: number, leafIndex: number):
    Promise<{ pathElements: Buffer[]; pathIndices: number[] }>;

  /** @deprecated use getPathByIndex */
  getProofByIndex?(treeId: number, leafIndex: number):
    Promise<{ pathElements: Buffer[]; pathIndices: number[] }>;

  // on-chain events
  recordDepositCompleted?(treeId: number, ev: DepositCompletedEvent): Promise<void>;
  recordTransferCompleted?(treeId: number, ev: TransferCompletedEvent): Promise<void>;
  recordWithdrawCompleted?(treeId: number, ev: WithdrawCompletedEvent): Promise<void>;
}

export class MySqlMerkleStore implements MerkleStore {
  constructor(public pool: Pool) {}

  // -------- meta ----------
  async getDepth(treeId: number): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT v FROM merkle_meta WHERE tree_id=? AND k='depth' LIMIT 1",
      [treeId]
    );
    const v: Buffer | undefined = (rows as any[])[0]?.v;
    if (!v || v.length < 1) {
      throw new Error(
        `Merkle meta 'depth' missing for tree_id=${treeId} — run scripts/init-canonical-tree.ts`
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
      "SELECT v FROM merkle_meta WHERE tree_id=? AND k='next_index' LIMIT 1",
      [treeId]
    );
    const v: Buffer | undefined = (rows as any[])[0]?.v;
    if (!v || v.length < 8) {
      // default to 0 if not initialized
      return 0;
    }
    // next_index is u64 LE (kept this as-is)
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
      "SELECT v FROM merkle_meta WHERE tree_id=? AND k='roots_next_slot' LIMIT 1",
      [treeId]
    );
    const v = (rows as any[])[0]?.v as Buffer | undefined;
    if (!v) return 0;
    return Number(v.readUInt8(0)) % 128; // 0..127
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

  // -------- roots (BE32 on disk) ----------
  async getRoot(treeId: number): Promise<Buffer> {
    // 1) merkle_meta root (BE)
    const [metaRows] = await this.pool.query(
      "SELECT v FROM merkle_meta WHERE tree_id = ? AND k = 'root' LIMIT 1",
      [treeId]
    );
    const metaRoot = (metaRows as any[])[0]?.v as Buffer | undefined;
    if (metaRoot?.length === 32) return metaRoot;

    // 2) latest in ring buffer (BE)
    const next = await this.getRootsNextSlot(this.pool, treeId); // 0..127
    const latest = (next + 127) % 128;
    const [rows] = await this.pool.query(
      "SELECT fe FROM roots WHERE tree_id=? AND slot_index=?",
      [treeId, latest]
    );
    const fe = (rows as any[])[0]?.fe as Buffer | undefined;
    if (fe?.length === 32) return fe;

    // 3) merkle_meta zero (BE)
    const [zeroRows] = await this.pool.query(
      "SELECT v FROM merkle_meta WHERE tree_id = ? AND k = 'zero' LIMIT 1",
      [treeId]
    );
    const metaZero = (zeroRows as any[])[0]?.v as Buffer | undefined;
    if (metaZero?.length === 32) return metaZero;

    // 4) Fallback: compute zero-root at configured depth and return BE
    const depth = await this.getDepth(treeId);
    const zTopBig = (await zeros(depth))[depth]!;
    return bigIntToBe32(zTopBig);
  }

  async setRoot(treeId: number, feBig: bigint): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const feBufBE = bigIntToBe32(feBig); // BE32

      // 1) Write into ring buffer
      const next = await this.getRootsNextSlot(conn, treeId); // 0..127
      await conn.query(
        `INSERT INTO roots(tree_id, slot_index, fe, fe_hex)
         VALUES(?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
        [treeId, next, feBufBE, feHex(feBufBE)]
      );

      // 2) Upsert current root in merkle_meta (key='root') — BE32
      await conn.query(
        `INSERT INTO merkle_meta(tree_id, k, v)
         VALUES(?, 'root', ?)
         ON DUPLICATE KEY UPDATE v=VALUES(v)`,
        [treeId, feBufBE]
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

  // -------- leaves (BE32 on disk) ----------
  async getLeaf(treeId: number, leafIndex: number): Promise<Buffer | null> {
    const [rows] = await this.pool.query(
      "SELECT fe FROM leaves WHERE tree_id=? AND leaf_index=?",
      [treeId, leafIndex]
    );
    return (rows as any[])[0]?.fe ?? null; // BE32
  }

  async putLeaf(treeId: number, leafIndex: number, feBig: bigint): Promise<void> {
    const feBufBE = bigIntToBe32(feBig);
    await this.pool.query(
      "INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex) VALUES(?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
      [treeId, leafIndex, feBufBE, feHex(feBufBE)]
    );
  }

  // -------- internal nodes (>=1) BE32 ----------
  async putNode(treeId: number, nodeLayer: number, nodeIndex: number, feBig: bigint): Promise<void> {
    if (nodeLayer === 0) throw new Error("putNode(layer=0) not allowed; use putLeaf");
    const feBufBE = bigIntToBe32(feBig);
    await this.pool.query(
      "INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex) VALUES(?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
      [treeId, nodeLayer, nodeIndex, feBufBE, feHex(feBufBE)]
    );
  }

  async getNode(treeId: number, nodeLayer: number, nodeIndex: number): Promise<Buffer | null> {
    const [rows] = await this.pool.query(
      "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
      [treeId, nodeLayer, nodeIndex]
    );
    return (rows as any[])[0]?.fe ?? null; // BE32
  }

  // -------- append & recompute (BE pipeline) ----------
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

      // write leaf (BE)
      const leafBufBE = bigIntToBe32(feBig);
      await conn.query(
        "INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex) VALUES(?, ?, ?, ?) " +
        "ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)",
        [treeId, leafIndex, leafBufBE, feHex(leafBufBE)]
      );

      // climb in BE
      let idx = leafIndex;
      let cur = feBig;

      const loadSiblingBE = async (layer: number, idx: number, isLeft: boolean): Promise<bigint> => {
        const sibIndex = isLeft ? idx + 1 : idx - 1;
        const [sib] = await conn.query(
          "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
          [treeId, layer, sibIndex]
        );
        const sibBuf: Buffer | undefined = (sib as any[])[0]?.fe; // BE32 or undefined
        return sibBuf ? be32ToBigInt(sibBuf) : (await zeros(layer))[layer]!;
      };

      for (let layer = 0; layer < depth; layer++) {
        const isLeft = (idx & 1) === 0;
        const sib = await loadSiblingBE(layer, idx, isLeft);

        const left  = isLeft ? cur : sib;
        const right = isLeft ? sib : cur;
        const parent = await H2(left, right);

        const nodeLayer = layer + 1;
        const nodeIndex = Math.floor(idx / 2);
        const parentBufBE = bigIntToBe32(parent);

        await conn.query(
          `INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex)
           VALUES(?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
          [treeId, nodeLayer, nodeIndex, parentBufBE, feHex(parentBufBE)]
        );

        if (process.env.MERKLE_TRACE === "1") {
          const toHexBE = (b: bigint) => bigIntToBe32(b).toString("hex");
          console.log(
            `[merkle:trace] layer=${layer} idx=${idx} isLeft=${isLeft} sibIndex=${isLeft ? idx + 1 : idx - 1} {`,
            { left: toHexBE(left), right: toHexBE(right), parent: toHexBE(parent), parent_decimal: parent.toString() },
            `}`
          );
        }

        cur = parent;
        idx >>= 1;
      }

      // write root (BE) + bump pointer, then bump next_index
      await this.setRoot(treeId, cur);
      await this.setNextIndex(treeId, leafIndex + 1);

      await conn.commit();
      return leafIndex;
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  // -------- path (BE siblings) ----------
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
      const sibFe: Buffer | undefined = (rows as any[])[0]?.fe; // BE32
      const sibBufBE = sibFe ?? bigIntToBe32((await zeros(layer))[layer]!);

      pathElements.push(sibBufBE);
      pathIndices.push(isLeft ? 0 : 1);
      idx >>= 1;
    }
    return { pathElements, pathIndices };
  }

  async getProofByIndex(treeId: number, leafIndex: number) {
    return this.getPathByIndex(treeId, leafIndex);
  }

  // -------- persist on-chain DepositCompleted (event roots are LE32) ----------
  async recordDepositCompleted(treeId: number, ev: DepositCompletedEvent): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const depth = await this.getDepth(treeId);

      // 1) Parse event -> numeric field elements (LE -> bigint)
      const commitmentBig = le32ToBigInt(Buffer.from(ev.commitment));
      const oldRootBig    = le32ToBigInt(Buffer.from(ev.old_merkle_root));
      const newRootBig    = le32ToBigInt(Buffer.from(ev.new_merkle_root));

      // post-increment in the event; we insert at (next - 1)
      const insertIndex = ev.next_leaf_index - 1;
      if (insertIndex < 0) throw new Error(`next_leaf_index=${ev.next_leaf_index} -> invalid`);

      // 2) Sanity: compare current DB root (BE on disk) with on-chain old root (LE→bigint)
      const curRootBufBE = await this.getRoot(treeId); // BE32
      const curRootBig   = be32ToBigInt(curRootBufBE);
      if (curRootBig !== oldRootBig) {
        const toHexBE = (b: bigint) => bigIntToBe32(b).toString("hex");
        console.warn(`[merkle] DB root != on-chain old_root (tree=${treeId})`, {
          db_hex_BE: toHexBE(curRootBig),
          onchain_old_hex_BE: toHexBE(oldRootBig),
        });
      }

      // 3) Put the leaf exactly at insertIndex — write BE to DB
      const leafBufBE = bigIntToBe32(commitmentBig);
      await conn.query(
        `INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex)
         VALUES(?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
        [treeId, insertIndex, leafBufBE, feHex(leafBufBE)]
      );

      // 4) Recompute parents on the path — read BE, write BE
      let idx = insertIndex;
      let cur = commitmentBig;

      const loadSiblingBE = async (layer: number, idx: number, isLeft: boolean): Promise<bigint> => {
        const sibIndex = isLeft ? idx + 1 : idx - 1;
        const [rows] = await conn.query(
          "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
          [treeId, layer, sibIndex]
        );
        const buf: Buffer | undefined = (rows as any[])[0]?.fe; // BE32
        return buf ? be32ToBigInt(buf) : (await zeros(layer))[layer]!;
      };

      for (let layer = 0; layer < depth; layer++) {
        const isLeft = (idx & 1) === 0;
        const sib = await loadSiblingBE(layer, idx, isLeft);

        const left  = isLeft ? cur : sib;
        const right = isLeft ? sib : cur;
        const parent = await H2(left, right);

        const nodeLayer = layer + 1;
        const nodeIndex = Math.floor(idx / 2);
        const parentBufBE = bigIntToBe32(parent);

        await conn.query(
          `INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex)
           VALUES(?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
          [treeId, nodeLayer, nodeIndex, parentBufBE, feHex(parentBufBE)]
        );

        cur = parent;
        idx >>= 1;
      }

      // 5) Persist authoritative on-chain root (store BE on disk)
      await this.setRoot(treeId, newRootBig);
      await this.setNextIndex(treeId, ev.next_leaf_index);

      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  // -------- persist on-chain TransferCompleted (two leaves; roots are LE32) ----------
  async recordTransferCompleted(treeId: number, ev: TransferCompletedEvent): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const depth = await this.getDepth(treeId);

      // 1) Parse LE32 -> bigint
      const out1Big      = le32ToBigInt(Buffer.from(ev.out1_commitment));
      const out2Big      = le32ToBigInt(Buffer.from(ev.out2_commitment));
      const oldRootBig   = le32ToBigInt(Buffer.from(ev.old_merkle_root));
      const newRoot1Big  = le32ToBigInt(Buffer.from(ev.new_merkle_root1));
      const newRoot2Big  = le32ToBigInt(Buffer.from(ev.new_merkle_root2));

      // 2) Compute insertion indices.
      // Event's next_leaf_index is POST-increment by 2 (after appending out1 and out2).
      // Therefore:
      const insertIndex1 = ev.next_leaf_index - 2;
      const insertIndex2 = ev.next_leaf_index - 1;
      if (insertIndex1 < 0 || insertIndex2 < 0 || insertIndex2 !== insertIndex1 + 1) {
        throw new Error(
          `next_leaf_index=${ev.next_leaf_index} -> invalid for two-leaf append (insert1=${insertIndex1}, insert2=${insertIndex2})`
        );
      }

      // 3) Sanity: DB root must match oldRootBig (warn if not)
      const curRootBufBE = await this.getRoot(treeId); // BE32
      const curRootBig   = be32ToBigInt(curRootBufBE);
      if (curRootBig !== oldRootBig) {
        const toHexBE = (b: bigint) => bigIntToBe32(b).toString("hex");
        console.warn(`[merkle] DB root != on-chain old_root (transfer; tree=${treeId})`, {
          db_hex_BE: toHexBE(curRootBig),
          onchain_old_hex_BE: toHexBE(oldRootBig),
        });
      }

      // Helper to recompute up the tree after inserting a leaf at a precise index.
      const recomputeFrom = async (startIdx: number, leafBig: bigint): Promise<bigint> => {
        // write leaf
        const leafBufBE = bigIntToBe32(leafBig);
        await conn.query(
          `INSERT INTO leaves(tree_id, leaf_index, fe, fe_hex)
           VALUES(?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
          [treeId, startIdx, leafBufBE, feHex(leafBufBE)]
        );

        let idx = startIdx;
        let cur = leafBig;

        const loadSiblingBE = async (layer: number, idx: number, isLeft: boolean): Promise<bigint> => {
          const sibIndex = isLeft ? idx + 1 : idx - 1;
          const [rows] = await conn.query(
            "SELECT fe FROM nodes_all WHERE tree_id=? AND node_layer=? AND node_index=?",
            [treeId, layer, sibIndex]
          );
          const buf: Buffer | undefined = (rows as any[])[0]?.fe; // BE32
          return buf ? be32ToBigInt(buf) : (await zeros(layer))[layer]!;
        };

        for (let layer = 0; layer < depth; layer++) {
          const isLeft = (idx & 1) === 0;
          const sib = await loadSiblingBE(layer, idx, isLeft);

          const left  = isLeft ? cur : sib;
          const right = isLeft ? sib : cur;
          const parent = await H2(left, right);

          const nodeLayer = layer + 1;
          const nodeIndex = Math.floor(idx / 2);
          const parentBufBE = bigIntToBe32(parent);

          await conn.query(
            `INSERT INTO nodes(tree_id, node_layer, node_index, fe, fe_hex)
             VALUES(?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE fe=VALUES(fe), fe_hex=VALUES(fe_hex)`,
            [treeId, nodeLayer, nodeIndex, parentBufBE, feHex(parentBufBE)]
          );

          cur = parent;
          idx >>= 1;
        }
        return cur; // final root (bigint)
      };

      // 4) Insert out1 at insertIndex1 and recompute to a root; compare with newRoot1Big.
      const rootAfter1 = await recomputeFrom(insertIndex1, out1Big);
      if (rootAfter1 !== newRoot1Big) {
        const toHexBE = (b: bigint) => bigIntToBe32(b).toString("hex");
        console.warn(`[merkle] Computed rootAfter1 != on-chain new_merkle_root1 (tree=${treeId})`, {
          computed_BE: toHexBE(rootAfter1),
          onchain_BE:  toHexBE(newRoot1Big),
        });
      }

      // 5) Insert out2 at insertIndex2 and recompute to a root; compare with newRoot2Big.
      const rootAfter2 = await recomputeFrom(insertIndex2, out2Big);
      if (rootAfter2 !== newRoot2Big) {
        const toHexBE = (b: bigint) => bigIntToBe32(b).toString("hex");
        console.warn(`[merkle] Computed rootAfter2 != on-chain new_merkle_root2 (tree=${treeId})`, {
          computed_BE: toHexBE(rootAfter2),
          onchain_BE:  toHexBE(newRoot2Big),
        });
      }

      // 6) Persist authoritative on-chain final root (new_merkle_root2) and next_index
      await this.setRoot(treeId, newRoot2Big);
      await this.setNextIndex(treeId, ev.next_leaf_index);

      await conn.commit();
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  async recordWithdrawCompleted(treeId: number, _ev: WithdrawCompletedEvent): Promise<void> {
    // Intentionally a no-op: withdraw does not modify the Merkle tree.
    // If you later persist nullifiers or accounting, implement it here.
    return;
  }

}
