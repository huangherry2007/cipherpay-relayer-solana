/* scripts/migrate.ts
 * One-shot migration runner for MySQL using mysql2/promise.
 * Runs all .sql files in src/db/migrations in lexicographic order.
 */

import fs from "fs";
import path from "path";
import { getPool } from "@/services/db/mysql.js";

const MIGRATIONS_DIR = path.resolve("src/db/migrations");

async function runSqlFile(filePath: string) {
  const pool = await getPool();
  const raw = fs.readFileSync(filePath, "utf8");

  // naive splitter: split on ';' and execute non-empty statements,
  // ignoring line and block comments.
  // (Good enough for our migrations since we don't embed semicolons in strings.)
  const cleaned = raw
    // remove /* ... */ block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // remove -- ... end-of-line comments
    .replace(/--.*$/gm, "");

  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    // console.debug("SQL:", stmt);
    await pool.query(stmt);
  }
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations dir not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) {
    console.log("No migrations to run.");
    process.exit(0);
  }

  console.log("Running migrations:");
  for (const f of files) console.log("  •", f);

  try {
    for (const f of files) {
      const full = path.join(MIGRATIONS_DIR, f);
      await runSqlFile(full);
    }
    console.log("✅ Migrations completed.");
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Migration failed:", err?.sqlMessage || err?.message || err);
    if (err?.sql) {
      console.error("   Offending SQL:", err.sql);
    }
    process.exit(1);
  }
}

main();
