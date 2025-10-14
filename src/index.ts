// src/index.ts
import { startServer } from "@/server/server.js";
import { getPool } from "@/services/db/mysql.js";
import { solanaRelayer } from "@/services/solana-relayer.js";

async function main() {
  const server = await startServer();
  const pool = await getPool();
  
  async function shutdown(signal: string) {
    console.log(`[relayer] received ${signal}, shutting down...`);
  
    // 1) stop Anchor event listeners (DepositCompleted, etc.)
    try {
      await solanaRelayer.stopListeners();
      console.log("[relayer] solana listeners stopped");
    } catch (e) {
      console.error("[relayer] error stopping solana listeners:", e);
    }
  
    // 2) close HTTP server
    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      console.log("[relayer] http server closed");
    } catch (e) {
      console.error("[relayer] error closing http server:", e);
    }
  
    // 3) close MySQL pool
    try {
      // If you have a local `pool` var: await pool.end();
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
