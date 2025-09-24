import { Connection, PublicKey, TransactionSignature } from '@solana/web3.js';
import { logger, createRequestLogger } from '@/utils/logger.js';
import { appMetrics } from './metrics.js';

// Solana transaction monitor
export class SolanaMonitor {
  private requestLogger = createRequestLogger('solana');
  private connection: Connection;
  private activeTransactions: Map<string, TransactionInfo> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
  }

  // Monitor transaction submission
  async monitorTransaction(
    operation: string,
    signature: TransactionSignature,
    additionalData?: any
  ): Promise<void> {
    const startTime = Date.now();
    const transactionInfo: TransactionInfo = {
      signature,
      operation,
      startTime,
      status: 'pending',
      additionalData,
    };

    this.activeTransactions.set(signature, transactionInfo);

    // Log transaction start
    this.requestLogger.solanaTx(operation, signature, 0, {
      status: 'submitted',
      ...additionalData,
    });

    // Start monitoring
    this.monitorTransactionStatus(signature, operation);
  }

  // Monitor transaction status
  private async monitorTransactionStatus(
    signature: TransactionSignature,
    operation: string
  ): Promise<void> {
    const maxRetries = 30; // 30 seconds timeout
    let retries = 0;

    const checkStatus = async (): Promise<void> => {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        const transactionInfo = this.activeTransactions.get(signature);

        if (!transactionInfo) {
          this.requestLogger.warn('Transaction info not found', { signature });
          return;
        }

        if (status.value) {
          const duration = Date.now() - transactionInfo.startTime;
          const success = status.value.err === null;

          // Update transaction info
          transactionInfo.status = success ? 'confirmed' : 'failed';
          transactionInfo.endTime = Date.now();
          transactionInfo.confirmationTime = duration;
          transactionInfo.error = status.value.err;

          // Log transaction result
          this.requestLogger.solanaTx(operation, signature, duration, {
            status: success ? 'confirmed' : 'failed',
            error: status.value.err,
            confirmations: status.value.confirmations,
          });

          // Update metrics
          appMetrics.solanaTransactionsTotal(operation, success ? 'success' : 'failed').inc();
          appMetrics.solanaTransactionDuration(operation).observe(duration);

          // Remove from active transactions
          this.activeTransactions.delete(signature);

          // Log performance
          if (duration > 10000) { // 10 seconds
            this.requestLogger.warn('Slow Solana transaction', {
              signature,
              operation,
              duration,
            });
          }
        } else {
          // Transaction not found yet, retry
          retries++;
          if (retries < maxRetries) {
            setTimeout(checkStatus, 1000); // Check every second
          } else {
            // Timeout
            const duration = Date.now() - transactionInfo.startTime;
            transactionInfo.status = 'timeout';
            transactionInfo.endTime = Date.now();
            transactionInfo.confirmationTime = duration;

            this.requestLogger.error('Solana transaction timeout', new Error('Transaction timeout'), {
              signature,
              operation,
              duration,
            });

            appMetrics.solanaTransactionsTotal(operation, 'timeout').inc();
            this.activeTransactions.delete(signature);
          }
        }
      } catch (error) {
        const duration = Date.now() - (this.activeTransactions.get(signature)?.startTime || Date.now());
        
        this.requestLogger.error('Error monitoring Solana transaction', error as Error, {
          signature,
          operation,
          duration,
        });

        appMetrics.solanaTransactionsTotal(operation, 'error').inc();
        this.activeTransactions.delete(signature);
      }
    };

    // Start checking
    setTimeout(checkStatus, 1000);
  }

  // Get active transactions
  getActiveTransactions(): TransactionInfo[] {
    return Array.from(this.activeTransactions.values());
  }

  // Get transaction info
  getTransactionInfo(signature: TransactionSignature): TransactionInfo | undefined {
    return this.activeTransactions.get(signature);
  }

  // Monitor account changes
  async monitorAccount(
    account: PublicKey,
    callback: (accountInfo: any) => void
  ): Promise<number> {
    const subscriptionId = this.connection.onAccountChange(
      account,
      (accountInfo) => {
        this.requestLogger.debug('Account change detected', {
          account: account.toString(),
          lamports: accountInfo.lamports,
          owner: accountInfo.owner.toString(),
        });

        callback(accountInfo);
      }
    );

    this.requestLogger.info('Account monitoring started', {
      account: account.toString(),
      subscriptionId,
    });

    return subscriptionId;
  }

  // Monitor program logs
  async monitorProgramLogs(
    programId: PublicKey,
    callback: (logs: any) => void
  ): Promise<number> {
    const subscriptionId = this.connection.onLogs(
      programId,
      (logs) => {
        this.requestLogger.debug('Program log received', {
          programId: programId.toString(),
          signature: logs.signature,
          logs: logs.logs,
        });

        callback(logs);
      }
    );

    this.requestLogger.info('Program log monitoring started', {
      programId: programId.toString(),
      subscriptionId,
    });

    return subscriptionId;
  }

  // Monitor slot changes
  async monitorSlotChanges(callback: (slot: number) => void): Promise<number> {
    const subscriptionId = this.connection.onSlotChange((slotInfo) => {
      this.requestLogger.debug('Slot change detected', {
        slot: slotInfo.slot,
        parent: slotInfo.parent,
        timestamp: Date.now(),
      });

      callback(slotInfo.slot);
    });

    this.requestLogger.info('Slot monitoring started', { subscriptionId });
    return subscriptionId;
  }

  // Get connection health
  async getConnectionHealth(): Promise<{
    healthy: boolean;
    latency: number;
    version: string;
    slot: number;
  }> {
    const start = Date.now();
    try {
      const [version, slot] = await Promise.all([
        this.connection.getVersion(),
        this.connection.getSlot(),
      ]);

      const latency = Date.now() - start;

      return {
        healthy: true,
        latency,
        version: version['solana-core'],
        slot,
      };
    } catch (error) {
      this.requestLogger.error('Connection health check failed', error as Error);
      return {
        healthy: false,
        latency: Date.now() - start,
        version: 'unknown',
        slot: 0,
      };
    }
  }

  // Get transaction history
  async getTransactionHistory(
    account: PublicKey,
    limit: number = 100
  ): Promise<TransactionInfo[]> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(account, { limit });
      
      const transactions: TransactionInfo[] = [];
      for (const sig of signatures) {
        transactions.push({
          signature: sig.signature,
          operation: 'historical',
          startTime: sig.blockTime ? sig.blockTime * 1000 : 0,
          status: sig.err ? 'failed' : 'confirmed',
          error: sig.err,
          confirmationTime: 0,
        });
      }

      return transactions;
    } catch (error) {
      this.requestLogger.error('Failed to get transaction history', error as Error, {
        account: account.toString(),
        limit,
      });
      return [];
    }
  }

  // Cleanup old transactions
  cleanupOldTransactions(maxAge: number = 300000): void { // 5 minutes
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [signature, info] of this.activeTransactions.entries()) {
      if (now - info.startTime > maxAge) {
        toDelete.push(signature);
      }
    }

    for (const signature of toDelete) {
      this.activeTransactions.delete(signature);
    }

    if (toDelete.length > 0) {
      this.requestLogger.debug('Cleaned up old transactions', {
        count: toDelete.length,
        maxAge,
      });
    }
  }
}

// Transaction info interface
export interface TransactionInfo {
  signature: string;
  operation: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'confirmed' | 'failed' | 'timeout';
  confirmationTime?: number;
  error?: any;
  additionalData?: any;
}

// Solana metrics collector
export class SolanaMetricsCollector {
  private monitor: SolanaMonitor;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(monitor: SolanaMonitor) {
    this.monitor = monitor;
  }

  start(intervalMs: number = 60000): void {
    this.intervalId = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error.error({ err: error }, 'Solana metrics collection failed');
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async collectMetrics(): Promise<void> {
    const health = await this.monitor.getConnectionHealth();
    const activeTransactions = this.monitor.getActiveTransactions();

    // Update connection health metrics
    appMetrics.solanaTransactionsTotal('connection_health', health.healthy ? 'healthy' : 'unhealthy').inc();
    appMetrics.solanaTransactionDuration('connection_latency').observe(health.latency);

    // Update active transaction metrics
    const pendingCount = activeTransactions.filter(tx => tx.status === 'pending').length;
    appMetrics.solanaTransactionsTotal('active_transactions', 'pending').inc(pendingCount);

    // Cleanup old transactions
    this.monitor.cleanupOldTransactions();

    logger.app.debug({
      healthy: health.healthy,
      latency: health.latency,
      activeTransactions: activeTransactions.length,
      pendingTransactions: pendingCount,
    }, 'Solana metrics collected');
  }
}

export default {
  SolanaMonitor,
  SolanaMetricsCollector,
  // TransactionInfo is exported as a type, not a value
};
