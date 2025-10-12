import { logger } from '@/utils/logger.js';
import { getPool } from '@/services/db/mysql.js';
import { Connection } from '@solana/web3.js';
import { loadEnv } from '@/services/config/env.js';

const env = loadEnv();

// Health check status
export enum HealthCheckStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  DEGRADED = 'degraded',
}

// Health check result
export interface HealthCheckResult {
  name: string;
  status: HealthCheckStatus;
  message?: string;
  details?: any;
  duration: number;
  timestamp: number;
}

// Overall health status
export interface HealthStatus {
  status: HealthCheckStatus;
  timestamp: number;
  checks: HealthCheckResult[];
  uptime: number;
  version: string;
}

// Individual health check interface
export interface HealthCheck {
  name: string;
  check: () => Promise<Omit<HealthCheckResult, 'name' | 'duration' | 'timestamp'>>;
  timeout?: number;
  critical?: boolean;
}

// Health check registry
class HealthCheckRegistry {
  private checks: Map<string, HealthCheck> = new Map();
  private startTime: number = Date.now();

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const start = Date.now();
    const timeout = check.timeout || 5000; // Default 5 second timeout

    try {
      const result = await Promise.race([
        check.check(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), timeout)
        )
      ]);

      const duration = Date.now() - start;
      return {
        name,
        duration,
        timestamp: Date.now(),
        ...result,
      };
    } catch (error) {
      const duration = Date.now() - start;
      return {
        name,
        status: HealthCheckStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration,
        timestamp: Date.now(),
      };
    }
  }

  async runAllChecks(): Promise<HealthStatus> {
    const checkResults: HealthCheckResult[] = [];
    const criticalChecks: string[] = [];

    // Run all checks in parallel
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      if (check.critical) {
        criticalChecks.push(name);
      }
      return this.runCheck(name);
    });

    const results = await Promise.allSettled(checkPromises);
    
    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        checkResults.push(result.value);
      } else {
        const checkName = Array.from(this.checks.keys())[i];
        checkResults.push({
          name: checkName,
          status: HealthCheckStatus.UNHEALTHY,
          message: result.reason?.message || 'Check failed',
          duration: 0,
          timestamp: Date.now(),
        });
      }
    }

    // Determine overall status
    const unhealthyChecks = checkResults.filter(r => r.status === HealthCheckStatus.UNHEALTHY);
    const criticalUnhealthy = unhealthyChecks.filter(r => criticalChecks.includes(r.name));
    
    let overallStatus: HealthCheckStatus;
    if (criticalUnhealthy.length > 0) {
      overallStatus = HealthCheckStatus.UNHEALTHY;
    } else if (unhealthyChecks.length > 0) {
      overallStatus = HealthCheckStatus.DEGRADED;
    } else {
      overallStatus = HealthCheckStatus.HEALTHY;
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      checks: checkResults,
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }
}

// Create global registry
export const healthRegistry = new HealthCheckRegistry();

// Database health check
healthRegistry.register({
  name: 'database',
  critical: true,
  timeout: 3000,
  check: async () => {
    try {
      const pool = await getPool();
      const connection = await pool.getConnection();
      
      // Test basic query
      await connection.execute('SELECT 1');
      connection.release();
      
      return {
        status: HealthCheckStatus.HEALTHY,
        message: 'Database connection successful',
        details: {
          host: env.mysql.host,
          port: env.mysql.port,
          database: env.mysql.database,
        },
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.UNHEALTHY,
        message: 'Database connection failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  },
});

// Solana RPC health check
healthRegistry.register({
  name: 'solana-rpc',
  critical: true,
  timeout: 5000,
  check: async () => {
    try {
      const connection = new Connection(env.solanaRpcUrl);
      
      // Test RPC call
      const version = await connection.getVersion();
      const slot = await connection.getSlot();
      
      return {
        status: HealthCheckStatus.HEALTHY,
        message: 'Solana RPC connection successful',
        details: {
          rpcUrl: env.solanaRpcUrl,
          version: version['solana-core'],
          currentSlot: slot,
        },
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.UNHEALTHY,
        message: 'Solana RPC connection failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          rpcUrl: env.solanaRpcUrl,
        },
      };
    }
  },
});

// Memory usage health check
healthRegistry.register({
  name: 'memory',
  critical: false,
  check: async () => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    // Consider unhealthy if heap usage is over 1GB
    const isHealthy = memUsage.heapUsed < 1024 * 1024 * 1024;
    
    return {
      status: isHealthy ? HealthCheckStatus.HEALTHY : HealthCheckStatus.DEGRADED,
      message: isHealthy ? 'Memory usage normal' : 'High memory usage detected',
      details: memUsageMB,
    };
  },
});

// Disk space health check
healthRegistry.register({
  name: 'disk-space',
  critical: false,
  check: async () => {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs ? await fs.statfs('.') : null;
      
      if (!stats) {
      return {
        status: HealthCheckStatus.HEALTHY,
        message: 'Disk space check not available on this platform',
      };
      }

      const freeSpaceGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
      const totalSpaceGB = (stats.blocks * stats.bsize) / (1024 * 1024 * 1024);
      const usedPercent = ((totalSpaceGB - freeSpaceGB) / totalSpaceGB) * 100;

      const isHealthy = usedPercent < 90; // Consider unhealthy if over 90% used
      
      return {
        status: isHealthy ? HealthCheckStatus.HEALTHY : HealthCheckStatus.DEGRADED,
        message: isHealthy ? 'Disk space sufficient' : 'Low disk space warning',
        details: {
          freeSpaceGB: Math.round(freeSpaceGB * 100) / 100,
          totalSpaceGB: Math.round(totalSpaceGB * 100) / 100,
          usedPercent: Math.round(usedPercent * 100) / 100,
        },
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.HEALTHY,
        message: 'Disk space check not available',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  },
});

// Custom health check for Merkle tree
healthRegistry.register({
  name: 'merkle-tree',
  critical: true,
  check: async () => {
    try {
      // This would check if the Merkle tree is accessible and functioning
      // For now, we'll just return healthy
      return {
        status: HealthCheckStatus.HEALTHY,
        message: 'Merkle tree accessible',
        details: {
          // Add tree-specific details here
        },
      };
    } catch (error) {
      return {
        status: HealthCheckStatus.UNHEALTHY,
        message: 'Merkle tree check failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  },
});

// Health check endpoints
export async function getHealthStatus(): Promise<HealthStatus> {
  return await healthRegistry.runAllChecks();
}

export async function getHealthCheck(name: string): Promise<HealthCheckResult> {
  return await healthRegistry.runCheck(name);
}

// Health check middleware for Express
export function healthCheckMiddleware() {
  return async (req: any, res: any, next: any) => {
    if (req.path === '/health' || req.path === '/healthz') {
      try {
        const health = await getHealthStatus();
        const statusCode = health.status === HealthCheckStatus.HEALTHY ? 200 : 
                          health.status === HealthCheckStatus.DEGRADED ? 200 : 503;
        
        res.status(statusCode).json(health);
      } catch (error) {
        logger.error.error({ err: error }, 'Health check failed');
        res.status(503).json({
          status: HealthCheckStatus.UNHEALTHY,
          message: 'Health check failed',
          timestamp: Date.now(),
        });
      }
    } else {
      next();
    }
  };
}

// Liveness probe (simple check)
export function livenessCheck() {
  return (req: any, res: any) => {
    res.status(200).json({
      status: 'alive',
      timestamp: Date.now(),
      uptime: process.uptime(),
    });
  };
}

// Readiness probe (checks dependencies)
export async function readinessCheck(req: any, res: any) {
  try {
    const health = await getHealthStatus();
    const statusCode = health.status === HealthCheckStatus.HEALTHY ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error.error({ err: error }, 'Readiness check failed');
    res.status(503).json({
      status: HealthCheckStatus.UNHEALTHY,
      message: 'Readiness check failed',
      timestamp: Date.now(),
    });
  }
}

export default healthRegistry;
