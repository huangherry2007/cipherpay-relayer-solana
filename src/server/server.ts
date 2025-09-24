// src/server/server.ts
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { makeAuthMiddleware } from "@/auth/index.js";
import { prepareRouter } from "@/server/routes/prepare.js";
import { submitRouter } from "@/server/routes/submit.js";
import { CanonicalTree } from "@/services/merkle/canonical-tree.js";
import { MySqlMerkleStore } from "@/services/merkle/stores/mysql-merkle-store.js";
import { getPool } from "@/services/db/mysql.js";
import { loadEnv } from "@/services/config/env.js";
import { ProofVerifier } from "@/zk/proof-verifier.js";
import { SolanaRelayer } from "@/services/solana-relayer.js";
import { 
  createLoggingMiddleware,
} from "@/middleware/logging.js";
import { 
  healthCheckMiddleware,
  livenessCheck,
  readinessCheck,
} from "@/monitoring/health.js";
import { 
  createDashboardRoutes,
  monitoringService,
} from "@/monitoring/index.js";
import { LoggedPool } from "@/monitoring/db-logger.js";
import { logger } from "@/utils/logger.js";

const env = loadEnv();

export async function makeServer() {
  const app = express();

  // Apply logging middleware first
  app.use(...createLoggingMiddleware());

  // capture raw body for HMAC
  app.use((req, res, next) => {
    let raw = Buffer.alloc(0);
    req.on("data", (chunk) => (raw = Buffer.concat([raw, chunk])));
    req.on("end", () => {
      (req as any).rawBody = raw;
      next();
    });
  });

  app.use(cors());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));

  // Initialize database with logging
  const pool = await getPool();
  const loggedPool = new LoggedPool(pool);
  const store = new MySqlMerkleStore(loggedPool.pool, 1); // tree_id=1
  const tree = await CanonicalTree.create(store);

  const verifier = new ProofVerifier(env.vkeyDir);
  
  // Initialize Solana relayer
  const solanaRelayer = await SolanaRelayer.create(
    {
      solanaRpcUrl: env.solanaRpcUrl || "https://api.devnet.solana.com",
      programId: "9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o",
      vkeyDir: env.vkeyDir
    },
    verifier,
    tree
  );

  // Start listening for Solana events
  solanaRelayer.startEventListening((event) => {
    logger.solana.info({ event }, "Solana event received");
    // Here you could update your database, send notifications, etc.
  });

  // Health check endpoints
  app.get("/health", healthCheckMiddleware());
  app.get("/healthz", livenessCheck);
  app.get("/ready", readinessCheck);

  // Monitoring dashboard endpoints
  const dashboardRoutes = createDashboardRoutes();
  app.get("/api/v1/monitoring/dashboard", dashboardRoutes.getDashboard);
  app.get("/api/v1/monitoring/health", dashboardRoutes.getHealth);
  app.get("/api/v1/monitoring/metrics", dashboardRoutes.getMetrics);
  app.get("/api/v1/monitoring/system", dashboardRoutes.getSystemInfo);
  app.post("/api/v1/monitoring/metrics/reset", dashboardRoutes.resetMetrics);

  // Legacy health endpoint
  app.get("/api/v1/health", (_, res) => res.json({ ok: true }));

  // protected
  app.use(makeAuthMiddleware());
  app.use("/api/v1/prepare", prepareRouter(tree));
  app.use("/api/v1/submit", submitRouter(verifier, solanaRelayer));

  // Start monitoring service
  monitoringService.start(30000); // Check every 30 seconds

  logger.app.info({
    port: env.port,
    solanaRpcUrl: env.solanaRpcUrl,
    programId: "9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o",
  }, "Server initialized with monitoring");

  return app;
}

// 🔹 Export a startServer that your index.ts can import
export async function startServer() {
  const app = await makeServer();
  return app.listen(env.port, () => {
    console.log(`listening on :${env.port}`);
  });
}