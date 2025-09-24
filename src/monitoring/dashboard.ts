import { Request, Response } from 'express';
import { metrics, appMetrics } from './metrics.js';
import { getHealthStatus, HealthCheckStatus } from './health.js';
import { logger } from '@/utils/logger.js';

// Dashboard data interface
export interface DashboardData {
  timestamp: number;
  health: any;
  metrics: {
    http: {
      totalRequests: number;
      requestsPerSecond: number;
      averageResponseTime: number;
      errorRate: number;
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
      averageTransactionTime: number;
      successRate: number;
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

// Get dashboard data
export async function getDashboardData(): Promise<DashboardData> {
  const timestamp = Date.now();
  
  try {
    // Get health status
    const health = await getHealthStatus();
    
    // Get all metrics
    const allMetrics = metrics.getAllMetrics();
    
    // Calculate HTTP metrics
    const httpMetrics = calculateHttpMetrics(allMetrics);
    
    // Calculate database metrics
    const dbMetrics = calculateDatabaseMetrics(allMetrics);
    
    // Calculate Solana metrics
    const solanaMetrics = calculateSolanaMetrics(allMetrics);
    
    // Calculate system metrics
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
    logger.error.error({ err: error }, 'Failed to get dashboard data');
    throw error;
  }
}

// Calculate HTTP metrics
function calculateHttpMetrics(allMetrics: any[]): any {
  const httpRequests = allMetrics.filter(m => m.name.startsWith('http_requests_total'));
  const httpDurations = allMetrics.filter(m => m.name.startsWith('http_request_duration_ms'));
  
  const totalRequests = httpRequests.reduce((sum, m) => sum + m.value, 0);
  const errorRequests = httpRequests
    .filter(m => m.labels?.status && parseInt(m.labels.status) >= 400)
    .reduce((sum, m) => sum + m.value, 0);
  
  const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
  
  // Calculate average response time from histogram
  const durationStats = httpDurations.map(m => {
    const stats = m.value; // Assuming this is histogram stats
    return stats.avg || 0;
  });
  
  const averageResponseTime = durationStats.length > 0 
    ? durationStats.reduce((sum, avg) => sum + avg, 0) / durationStats.length 
    : 0;

  return {
    totalRequests,
    requestsPerSecond: 0, // Would need time-based calculation
    averageResponseTime,
    errorRate,
  };
}

// Calculate database metrics
function calculateDatabaseMetrics(allMetrics: any[]): any {
  const dbQueries = allMetrics.filter(m => m.name.startsWith('db_queries_total'));
  const dbDurations = allMetrics.filter(m => m.name.startsWith('db_query_duration_ms'));
  
  const totalQueries = dbQueries.reduce((sum, m) => sum + m.value, 0);
  
  const durationStats = dbDurations.map(m => {
    const stats = m.value;
    return stats.avg || 0;
  });
  
  const averageQueryTime = durationStats.length > 0 
    ? durationStats.reduce((sum, avg) => sum + avg, 0) / durationStats.length 
    : 0;

  return {
    totalQueries,
    averageQueryTime,
    connectionPool: {
      active: 0, // Would need to get from connection pool
      idle: 0,
      total: 0,
    },
  };
}

// Calculate Solana metrics
function calculateSolanaMetrics(allMetrics: any[]): any {
  const solanaTxs = allMetrics.filter(m => m.name.startsWith('solana_transactions_total'));
  const solanaDurations = allMetrics.filter(m => m.name.startsWith('solana_transaction_duration_ms'));
  
  const totalTransactions = solanaTxs.reduce((sum, m) => sum + m.value, 0);
  const successfulTxs = solanaTxs
    .filter(m => m.labels?.status === 'success')
    .reduce((sum, m) => sum + m.value, 0);
  
  const successRate = totalTransactions > 0 ? (successfulTxs / totalTransactions) * 100 : 0;
  
  const durationStats = solanaDurations.map(m => {
    const stats = m.value;
    return stats.avg || 0;
  });
  
  const averageTransactionTime = durationStats.length > 0 
    ? durationStats.reduce((sum, avg) => sum + avg, 0) / durationStats.length 
    : 0;

  return {
    totalTransactions,
    averageTransactionTime,
    successRate,
  };
}

// Calculate system metrics
function calculateSystemMetrics(): any {
  const memUsage = process.memoryUsage();
  
  return {
    memoryUsage: {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },
    uptime: process.uptime(),
    cpuUsage: 0, // Would need additional library to measure CPU
  };
}

// Dashboard API endpoints
export function createDashboardRoutes() {
  return {
    // Get full dashboard data
    getDashboard: async (req: Request, res: Response) => {
      try {
        const data = await getDashboardData();
        res.json(data);
      } catch (error) {
        logger.error.error({ err: error }, 'Dashboard data fetch failed');
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
      }
    },

    // Get health status
    getHealth: async (req: Request, res: Response) => {
      try {
        const health = await getHealthStatus();
        const statusCode = health.status === HealthCheckStatus.HEALTHY ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        logger.error.error({ err: error }, 'Health check failed');
        res.status(503).json({ error: 'Health check failed' });
      }
    },

    // Get metrics
    getMetrics: async (req: Request, res: Response) => {
      try {
        const allMetrics = metrics.getAllMetrics();
        res.json({
          timestamp: Date.now(),
          metrics: allMetrics,
        });
      } catch (error) {
        logger.error.error({ err: error }, 'Metrics fetch failed');
        res.status(500).json({ error: 'Failed to fetch metrics' });
      }
    },

    // Get system info
    getSystemInfo: async (req: Request, res: Response) => {
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
        logger.error.error({ err: error }, 'System info fetch failed');
        res.status(500).json({ error: 'Failed to fetch system info' });
      }
    },

    // Reset metrics
    resetMetrics: async (req: Request, res: Response) => {
      try {
        metrics.reset();
        logger.app.info({ requestId: req.requestId }, 'Metrics reset requested');
        res.json({ message: 'Metrics reset successfully' });
      } catch (error) {
        logger.error.error({ err: error }, 'Metrics reset failed');
        res.status(500).json({ error: 'Failed to reset metrics' });
      }
    },
  };
}

// Alert conditions
export interface AlertCondition {
  name: string;
  condition: (data: DashboardData) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

// Predefined alert conditions
export const alertConditions: AlertCondition[] = [
  {
    name: 'high_error_rate',
    condition: (data) => data.metrics.http.errorRate > 10,
    severity: 'high',
    message: 'High error rate detected',
  },
  {
    name: 'slow_response_time',
    condition: (data) => data.metrics.http.averageResponseTime > 5000,
    severity: 'medium',
    message: 'Slow response times detected',
  },
  {
    name: 'high_memory_usage',
    condition: (data) => data.metrics.system.memoryUsage.heapUsed > 500,
    severity: 'high',
    message: 'High memory usage detected',
  },
  {
    name: 'low_solana_success_rate',
    condition: (data) => data.metrics.solana.successRate < 90,
    severity: 'critical',
    message: 'Low Solana transaction success rate',
  },
  {
    name: 'unhealthy_service',
    condition: (data) => data.health.status !== 'healthy',
    severity: 'critical',
    message: 'Service is unhealthy',
  },
];

// Check alerts
export function checkAlerts(data: DashboardData): Array<AlertCondition & { triggered: boolean }> {
  return alertConditions.map(condition => ({
    ...condition,
    triggered: condition.condition(data),
  }));
}

// Alert handler
export class AlertHandler {
  private alerts: Map<string, number> = new Map(); // Track last alert time
  private cooldownMs: number = 60000; // 1 minute cooldown

  async handleAlert(alert: AlertCondition & { triggered: boolean }, data: DashboardData): Promise<void> {
    if (!alert.triggered) return;

    const now = Date.now();
    const lastAlert = this.alerts.get(alert.name);
    
    // Check cooldown
    if (lastAlert && (now - lastAlert) < this.cooldownMs) {
      return;
    }

    // Log alert
    logger.error.error({
      err: new Error(alert.message),
      alert: alert.name,
      severity: alert.severity,
      data: {
        http: data.metrics.http,
        system: data.metrics.system,
        health: data.health.status,
      },
    }, `ALERT: ${alert.message}`);

    // Update last alert time
    this.alerts.set(alert.name, now);

    // Here you would integrate with external alerting systems
    // e.g., Slack, PagerDuty, email, etc.
    await this.sendAlert(alert, data);
  }

  private async sendAlert(alert: AlertCondition & { triggered: boolean }, data: DashboardData): Promise<void> {
    // Implement alert sending logic here
    // This could integrate with:
    // - Slack webhooks
    // - PagerDuty API
    // - Email services
    // - SMS services
    // - Custom webhook endpoints
    
    logger.app.info({
      severity: alert.severity,
      message: alert.message,
    }, `Alert sent: ${alert.name}`);
  }
}

// Create alert handler instance
export const alertHandler = new AlertHandler();

// Monitoring service
export class MonitoringService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(intervalMs: number = 30000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      try {
        const data = await getDashboardData();
        const alerts = checkAlerts(data);
        
        // Handle alerts
        for (const alert of alerts) {
          await alertHandler.handleAlert(alert, data);
        }
      } catch (error) {
        logger.error.error({ err: error }, 'Monitoring service error');
      }
    }, intervalMs);

    logger.app.info({ intervalMs }, 'Monitoring service started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.app.info({}, 'Monitoring service stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// Create monitoring service instance
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
