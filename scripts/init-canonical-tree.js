#!/usr/bin/env node
/**
 * Bulk-initialize the canonical Merkle tree (single tree_id = 1) using multi-row INSERTs.
 * Uses mysql2/promise and VALUES ? expansion to avoid manual placeholder flattening.
 *
 * Requires: circomlibjs (buildPoseidon), mysql2
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { buildPoseidon } from "circomlibjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from repo root
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ---- Config
const TREE_ID = 1;
const TREE_DEPTH = Number(process.env.CP_TREE_DEPTH ?? 16);     // default 16
const CHUNK_SIZE = Number(process.env.CP_BULK_CHUNK_SIZE ?? 2000);
const ZERO_LEAF_HEX = "0".repeat(64); // 32 bytes hex(0)

// DB
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "cipherpay",
};

function to0x(h) {
  return h.startsWith && h.startsWith("0x") ? h : "0x" + h;
}

/**
 * Normalize inputs to 32-byte lowercase hex (no 0x prefix).
 * Accepts:
 *  - hex string (with/without 0x)
 *  - Buffer
 *  - Uint8Array
 *  - accidental "130,154,..." comma-separated decimal list
 */
function normalizeHex32(x) {
  if (typeof x === "string") {
    let s = x.trim().toLowerCase();
    if (s.startsWith("0x")) s = s.slice(2);

    // If it's a decimal comma-list, convert to bytes → hex
    if (/^\d+(,\s*\d+)*$/.test(s)) {
      const bytes = s.split(",").map(t => {
        const v = parseInt(t.trim(), 10);
        if (Number.isNaN(v) || v < 0 || v > 255) throw new Error("Invalid byte in comma list");
        return v;
      });
      s = Buffer.from(Uint8Array.from(bytes)).toString("hex");
    }

    if (!/^[0-9a-f]*$/.test(s)) {
      throw new Error(`normalizeHex32: invalid hex string`);
    }
    return s.padStart(64, "0").slice(-64);
  }
  if (x && typeof x === "object") {
    if (Buffer.isBuffer(x)) return x.toString("hex").padStart(64, "0").slice(-64);
    if (x instanceof Uint8Array) return Buffer.from(x).toString("hex").padStart(64, "0").slice(-64);
  }
  throw new Error(`normalizeHex32: unsupported type ${typeof x}`);
}

function poseidonHex2(poseidon, aIn, bIn) {
  const aHex = normalizeHex32(aIn);
  const bHex = normalizeHex32(bIn);
  const a = BigInt(to0x(aHex));
  const b = BigInt(to0x(bHex));
  const out = poseidon([a, b]);
  const bi = typeof out === "bigint" ? out : poseidon.F.toObject(out); // compat with field element objects
  return bi.toString(16).padStart(64, "0");
}

function buildZeroHashes(depth, poseidon) {
  const z = new Array(depth + 1);
  z[0] = ZERO_LEAF_HEX;
  for (let lvl = 1; lvl <= depth; lvl++) {
    z[lvl] = poseidonHex2(poseidon, z[lvl - 1], z[lvl - 1]);
  }
  return z;
}

async function ensureTables(conn) {
  const req = ["merkle_meta", "leaves", "nodes", "roots"];
  const [rows] = await conn.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${req.map(() => "?").join(",")})`,
    [DB_CONFIG.database, ...req]
  );
  const got = new Set(rows.map(r => r.TABLE_NAME));
  const miss = req.filter(t => !got.has(t));
  if (miss.length) throw new Error(`Missing required tables: ${miss.join(", ")}`);
}

async function clearTree(conn) {
  await conn.execute("DELETE FROM leaves WHERE tree_id = ?", [TREE_ID]);
  await conn.execute("DELETE FROM nodes  WHERE tree_id = ?", [TREE_ID]);
  await conn.execute("DELETE FROM roots  WHERE tree_id = ?", [TREE_ID]);
  await conn.execute("DELETE FROM merkle_meta WHERE tree_id = ?", [TREE_ID]);
}

async function insertMetadata(conn, zeroHashes) {
  const depthBuf = Buffer.from([TREE_DEPTH & 0xff]); // u8
  const nextIdxBuf = Buffer.alloc(8, 0);             // u64 LE = 0
  const rootHex = zeroHashes[TREE_DEPTH];
  const zeroHex = zeroHashes[0];

  const rows = [
    [TREE_ID, "depth", depthBuf],
    [TREE_ID, "next_index", nextIdxBuf],
    [TREE_ID, "root", Buffer.from(rootHex, "hex")],
    [TREE_ID, "zero", Buffer.from(zeroHex, "hex")],
  ];
  await conn.query(
    "INSERT INTO merkle_meta (tree_id, k, v) VALUES ?",
    [rows]
  );
}

async function insertNodesBulk(conn, zeroHashes) {
  let total = 0;
  // nodes: (tree_id, node_layer, node_index, fe, fe_hex)
  for (let level = 1; level <= TREE_DEPTH; level++) {
    const count = 2 ** (TREE_DEPTH - level);
    const feHex = zeroHashes[level];
    if (!feHex) throw new Error(`zeroHashes[${level}] undefined`);
    const feBuf = Buffer.from(feHex, "hex");

    for (let start = 0; start < count; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, count);
      const rows = new Array(end - start);
      for (let i = 0; i < rows.length; i++) {
        const idx = start + i;
        rows[i] = [TREE_ID, level, idx, feBuf, feHex];
      }

      try {
        await conn.query(
          "INSERT INTO nodes (tree_id, node_layer, node_index, fe, fe_hex) VALUES ?",
          [rows]
        );
      } catch (e) {
        console.error(`❌ nodes insert failed at level=${level} start=${start} size=${rows.length}`);
        throw e;
      }
      total += rows.length;
    }
  }
  return total;
}

async function insertLeavesBulk(conn) {
  // leaves: (tree_id, leaf_index, fe, fe_hex)
  const totalLeaves = 2 ** TREE_DEPTH;
  const feBuf = Buffer.from(ZERO_LEAF_HEX, "hex");
  const feHex = ZERO_LEAF_HEX;
  let total = 0;

  for (let start = 0; start < totalLeaves; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, totalLeaves);
    const rows = new Array(end - start);
    for (let i = 0; i < rows.length; i++) {
      const idx = start + i;
      rows[i] = [TREE_ID, idx, feBuf, feHex];
    }
    try {
      await conn.query(
        "INSERT INTO leaves (tree_id, leaf_index, fe, fe_hex) VALUES ?",
        [rows]
      );
    } catch (e) {
      console.error(`❌ leaves insert failed at start=${start} size=${rows.length}`);
      throw e;
    }
    total += rows.length;
  }
  return total;
}

async function verifyCounts(conn) {
  const [[{ c: nodeCount }]] = await conn.query(
    "SELECT COUNT(*) AS c FROM nodes WHERE tree_id = ?",
    [TREE_ID]
  );
  const [[{ c: leafCount }]] = await conn.query(
    "SELECT COUNT(*) AS c FROM leaves WHERE tree_id = ?",
    [TREE_ID]
  );
  const expectedNodes = 2 ** TREE_DEPTH - 1;
  const expectedLeaves = 2 ** TREE_DEPTH;

  if (nodeCount !== expectedNodes)
    throw new Error(`Node count mismatch: expected ${expectedNodes}, got ${nodeCount}`);
  if (leafCount !== expectedLeaves)
    throw new Error(`Leaf count mismatch: expected ${expectedLeaves}, got ${leafCount}`);
}

async function main() {
  console.log("🚀 Canonical Merkle tree initialization (bulk)...");
  console.log(`   depth=${TREE_DEPTH} leaves=${2 ** TREE_DEPTH} chunk=${CHUNK_SIZE} tree_id=${TREE_ID}`);
  console.log(`   db=${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);

  // Build Poseidon instance (there is no direct 'poseidon' export)
  const poseidon = await buildPoseidon();

  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    await ensureTables(conn);

    // speed ups (session-scoped)
    await conn.query("SET SESSION foreign_key_checks = 0");
    await conn.query("SET SESSION unique_checks = 0");
    await conn.query("SET SESSION sql_log_bin = 0");

    await conn.beginTransaction();

    console.log("🧹 Clearing existing tree...");
    await clearTree(conn);

    console.log("🔢 Generating zero hashes...");
    const zeroHashes = buildZeroHashes(TREE_DEPTH, poseidon);
    if (!zeroHashes[TREE_DEPTH]) throw new Error("zeroHashes tail undefined");

    console.log("📝 Inserting metadata...");
    await insertMetadata(conn, zeroHashes);

    console.log("🌳 Inserting nodes (bulk)...");
    const totalNodes = await insertNodesBulk(conn, zeroHashes);

    console.log("🍃 Inserting leaves (bulk)...");
    const totalLeaves = await insertLeavesBulk(conn);

    console.log("🔍 Verifying counts...");
    await verifyCounts(conn);

    await conn.commit();

    console.log("✅ Done!");
    console.log(`   nodes=${totalNodes.toLocaleString()} leaves=${totalLeaves.toLocaleString()}`);
    console.log(`   root=0x${zeroHashes[TREE_DEPTH]}`);
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("💥 Initialization failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      await conn.query("SET SESSION foreign_key_checks = 1");
      await conn.query("SET SESSION unique_checks = 1");
      await conn.query("SET SESSION sql_log_bin = 1");
    } catch {}
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
