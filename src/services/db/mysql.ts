// src/services/db/mysql.ts
import mysql, { Pool } from "mysql2/promise";
import { loadEnv } from "@/services/config/env.js";

let _pool: Pool | null = null;
export async function getPool() {
  if (_pool) return _pool;
  const env = loadEnv();
  _pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    connectionLimit: 8,
  });
  return _pool;
}
