// src/monitoring/dashboard.ts
import { Request, Response } from "express";
import { metrics, appMetrics } from "./metrics.js";
import { getHealthStatus, HealthCheckStatus } from "./health.js";
import { logger } from "@/utils/logger.js";

/* ============ Config (env) ============ */
const SUCCESS_RATE_THRESHOLD = Number(process.env.SUCCESS_RATE_THRESHOLD ?? 90); // %
const MIN_TX_SAMPLES = Number(process.env.MIN_TX_SAMPLES ?? 10);                 // tx count
const ERROR_RATE_THRESHOLD = Number(process.env.ERROR_RATE_THRESHOLD ?? 10);     // %
const SLOW_RESPONSE_THRESHOLD_MS = Number(process.env.SLOW_RESPONSE_THRESHOLD_MS ?? 5000);
const HIGH_HEAP_USED_MB = Number(process.env.HIGH_HEAP_USED_MB ?? 500);
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS ?? 30_000);
const ALERT_COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS ?? 60_000);

/* ============ Types ============ */
export interface DashboardData {
  timestamp: number;
  health: any;
  metrics: {
    http: {
      totalRequests: number;
      requestsPerSecond: number;
      averageResponseTime: number;
      errorRate: number; // %
    };
    database: {
      totalQueries: number;
      averageQueryTime: number;
      connectionPool: {
        active: number;
        idle: number;
        total: number;
      };
    };
    solana: {
      totalTransactions: number;
      txPerSecond: number;
      averageTransactionTime: number;
      successRate: number; // %
    };
    system: {
      memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
      };
      uptime: number;
      cpuUsage: number;
    };
  };
}

/* ============ Rate computer (delta-based) ============ */
// Simple module-level snapshot for delta computation between polling intervals.
let lastSnapshot = {
  t: 0,
  httpTotal: 0,
  solanaTotal: 0,
};

function computeRate(currentTotal: number, previousTotal: number, msDelta: number): number {
  if (msDelta <= 0) return 0;
  const diff = Math.max(0, currentTotal - previousTotal);
  return diff / (msDelta / 1000);
}

/* ============ Core builders ============ */
export async function getDashboardData(): Promise<DashboardData> {
  const timestamp = Date.now();

  try {
    const health = await getHealthStatus();
    const allMetrics = metrics.getAllMetrics();

    const httpMetrics = calculateHttpMetrics(allMetrics, timestamp);
    const dbMetrics = calculateDatabaseMetrics(allMetrics);
    const solanaMetrics = calculateSolanaMetrics(allMetrics, timestamp);
    const systemMetrics = calculateSystemMetrics();

    return {
      timestamp,
      health,
      metrics: {
        http: httpMetrics,
        database: dbMetrics,
        solana: solanaMetrics,
        system: systemMetrics,
      },
    };
  } catch (error) {
    logger.app.error({ err: error }, "Failed to get dashboard data");
    throw error;
  }
}

/* ============ Helpers ============ */
function sumValues(metricsArr: any[], predicate: (m: any) => boolean): number {
  return metricsArr.filter(predicate).reduce((sum, m) => sum + Number(m.value || 0), 0);
}

function avgOf(metricsArr: any[], predicate: (m: any) => boolean): number {
  const vals = metricsArr.filter(predicate).map((m) => Number(m.value || 0));
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/* ============ Calculators ============ */
function calculateHttpMetrics(allMetrics: any[], now: number): DashboardData["metrics"]["http"] {
  // Counters
  const totalRequests = sumValues(allMetrics, (m) => m.name === "http_requests_total");
  const errorRequests = sumValues(
    allMetrics,
    (m) => m.name === "http_requests_total" && m.labels?.status && Number(m.labels.status) >= 400
  );
  const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;

  // Histogram avg (your registry emits *_avg)
  const averageResponseTime = avgOf(
    allMetrics,
    (m) => m.name === "http_request_duration_ms_avg"
  );

  // RPS via delta
  const dt = lastSnapshot.t ? now - lastSnapshot.t : 0;
  const rps = computeRate(totalRequests, lastSnapshot.httpTotal, dt);

  // Update snapshot
  lastSnapshot.httpTotal = totalRequests;
  lastSnapshot.t = now;

  return {
    totalRequests,
    requestsPerSecond: rps,
    averageResponseTime,
    errorRate,
  };
}

function calculateDatabaseMetrics(allMetrics: any[]): DashboardData["metrics"]["database"] {
  const totalQueries = sumValues(allMetrics, (m) => m.name === "db_queries_total");
  const averageQueryTime = avgOf(allMetrics, (m) => m.name === "db_query_duration_ms_avg");

  return {
    totalQueries,
    averageQueryTime,
    connectionPool: {
      active: 0, // TODO: wire from your DB pool
      idle: 0,
      total: 0,
    },
  };
}

function calculateSolanaMetrics(allMetrics: any[], now: number): DashboardData["metrics"]["solana"] {
  const totalTransactions = sumValues(allMetrics, (m) => m.name === "solana_transactions_total");
  const successfulTxs = sumValues(
    allMetrics,
    (m) => m.name === "solana_transactions_total" && m.labels?.status === "success"
  );
  const successRate = totalTransactions > 0 ? (successfulTxs / totalTransactions) * 100 : 0;

  // Histogram avg
  const averageTransactionTime = avgOf(
    allMetrics,
    (m) => m.name === "solana_transaction_duration_ms_avg"
  );

  // TPS via delta
  const dt = lastSnapshot.t ? now - lastSnapshot.t : 0;
  const tps = computeRate(totalTransactions, lastSnapshot.solanaTotal, dt);

  // Update snapshot (note: http updated snapshot.t too; keep same timebase)
  lastSnapshot.solanaTotal = totalTransactions;

  return {
    totalTransactions,
    txPerSecond: tps,
    averageTransactionTime,
    successRate,
  };
}

function calculateSystemMetrics(): DashboardData["metrics"]["system"] {
  const mem = process.memoryUsage();
  return {
    memoryUsage: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      external: Math.round((mem as any).external / 1024 / 1024),
    },
    uptime: process.uptime(),
    cpuUsage: 0, // optional: wire pidusage/os.loadavg
  };
}

/* ============ HTTP routes ============ */
export function createDashboardRoutes() {
  return {
    getDashboard: async (_req: Request, res: Response) => {
      try {
        const data = await getDashboardData();
        res.json(data);
      } catch (error) {
        logger.app.error({ err: error }, "Dashboard data fetch failed");
        res.status(500).json({ error: "Failed to fetch dashboard data" });
      }
    },

    getHealth: async (_req: Request, res: Response) => {
      try {
        const health = await getHealthStatus();
        const statusCode = health.status === HealthCheckStatus.HEALTHY ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        logger.app.error({ err: error }, "Health check failed");
        res.status(503).json({ error: "Health check failed" });
      }
    },

    getMetrics: async (_req: Request, res: Response) => {
      try {
        const allMetrics = metrics.getAllMetrics();
        res.json({ timestamp: Date.now(), metrics: allMetrics });
      } catch (error) {
        logger.app.error({ err: error }, "Metrics fetch failed");
        res.status(500).json({ error: "Failed to fetch metrics" });
      }
    },

    getSystemInfo: async (_req: Request, res: Response) => {
      try {
        const systemMetrics = calculateSystemMetrics();
        res.json({
          timestamp: Date.now(),
          system: systemMetrics,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        });
      } catch (error) {
        logger.app.error({ err: error }, "System info fetch failed");
        res.status(500).json({ error: "Failed to fetch system info" });
      }
    },

    resetMetrics: async (req: Request, res: Response) => {
      try {
        metrics.reset();
        logger.app.info({ requestId: (req as any).requestId }, "Metrics reset requested");
        // Reset snapshot too so rates don't spike
        lastSnapshot = { t: 0, httpTotal: 0, solanaTotal: 0 };
        res.json({ message: "Metrics reset successfully" });
      } catch (error) {
        logger.app.error({ err: error }, "Metrics reset failed");
        res.status(500).json({ error: "Failed to reset metrics" });
      }
    },
  };
}

/* ============ Alerts ============ */
export interface AlertCondition {
  name: string;
  condition: (data: DashboardData) => boolean;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

export const alertConditions: AlertCondition[] = [
  {
    name: "high_error_rate",
    condition: (data) => data.metrics.http.errorRate > ERROR_RATE_THRESHOLD,
    severity: "high",
    message: "High error rate detected",
  },
  {
    name: "slow_response_time",
    condition: (data) => data.metrics.http.averageResponseTime > SLOW_RESPONSE_THRESHOLD_MS,
    severity: "medium",
    message: "Slow response times detected",
  },
  {
    name: "high_memory_usage",
    condition: (data) => data.metrics.system.memoryUsage.heapUsed > HIGH_HEAP_USED_MB,
    severity: "high",
    message: "High memory usage detected",
  },
  {
    name: "low_solana_success_rate",
    condition: (data) =>
      data.metrics.solana.totalTransactions >= MIN_TX_SAMPLES &&
      data.metrics.solana.successRate < SUCCESS_RATE_THRESHOLD,
    severity: "critical",
    message: "Low Solana transaction success rate",
  },
  {
    name: "unhealthy_service",
    condition: (data) => data.health.status !== "healthy",
    severity: "critical",
    message: "Service is unhealthy",
  },
];

export function checkAlerts(
  data: DashboardData
): Array<AlertCondition & { triggered: boolean }> {
  return alertConditions.map((condition) => ({
    ...condition,
    triggered: condition.condition(data),
  }));
}

/* ============ Alert handler & service ============ */
export class AlertHandler {
  private alerts: Map<string, number> = new Map(); // last alert time
  private cooldownMs: number = ALERT_COOLDOWN_MS;

  async handleAlert(
    alert: AlertCondition & { triggered: boolean },
    data: DashboardData
  ): Promise<void> {
    if (!alert.triggered) return;

    const now = Date.now();
    const lastAlert = this.alerts.get(alert.name);
    if (lastAlert && now - lastAlert < this.cooldownMs) return;

    logger.app.error(
      {
        err: new Error(alert.message),
        alert: alert.name,
        severity: alert.severity,
        data: {
          http: data.metrics.http,
          system: data.metrics.system,
          health: data.health.status,
        },
      },
      `ALERT: ${alert.message}`
    );

    this.alerts.set(alert.name, now);
    await this.sendAlert(alert, data);
  }

  private async sendAlert(
    alert: AlertCondition & { triggered: boolean },
    _data: DashboardData
  ): Promise<void> {
    // Integrate Slack/PagerDuty/etc. here
    logger.app.info(
      { severity: alert.severity, message: alert.message },
      `Alert sent: ${alert.name}`
    );
  }
}

export const alertHandler = new AlertHandler();

export class MonitoringService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(intervalMs: number = MONITOR_INTERVAL_MS): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      try {
        const data = await getDashboardData();
        const alerts = checkAlerts(data);
        for (const alert of alerts) {
          await alertHandler.handleAlert(alert, data);
        }
      } catch (error) {
        logger.app.error({ err: error }, "Monitoring service error");
      }
    }, intervalMs);

    logger.app.info({ intervalMs }, "Monitoring service started");
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    logger.app.info({}, "Monitoring service stopped");
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const monitoringService = new MonitoringService();

export default {
  getDashboardData,
  createDashboardRoutes,
  checkAlerts,
  AlertHandler,
  MonitoringService,
  monitoringService,
  alertHandler,
};
