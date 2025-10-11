// src/index.ts
import { startServer } from "@/server/server.js";
import { getPool } from "@/services/db/mysql.js";

async function main() {
  const server = await startServer();
  const pool = await getPool();

  async function shutdown(signal: string) {
    console.log(`[relayer] received ${signal}, shutting down...`);
    try {
      // Close HTTP server
      await new Promise<void>((resolve) => server.close(() => resolve()));
      console.log("[relayer] http server closed");
    } catch (e) {
      console.error("[relayer] error closing http server:", e);
    }
    try {
      await pool.end();
      console.log("[relayer] mysql pool closed");
    } catch (e) {
      console.error("[relayer] error closing mysql pool:", e);
    }
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[relayer] fatal:", err);
  process.exit(1);
});
