import { Pool, PoolConnection } from 'mysql2/promise';
import { logger, createRequestLogger } from '@/utils/logger.js';
import { appMetrics } from './metrics.js';

// Database query logger
export class DatabaseLogger {
  private requestLogger = createRequestLogger('database');

  // Log query execution
  logQuery(
    query: string,
    params: any[] = [],
    duration: number,
    connectionId?: number
  ): void {
    // Log query details
    this.requestLogger.dbQuery(query, duration, {
      params: params.length > 0 ? params : undefined,
      connectionId,
      queryType: this.getQueryType(query),
    });

    // Update metrics
    const queryType = this.getQueryType(query);
    const table = this.extractTableName(query);
    
    appMetrics.dbQueriesTotal(queryType, table).inc();
    appMetrics.dbQueryDuration(queryType, table).observe(duration);
  }

  // Log connection events
  logConnection(connectionId: number, event: 'acquired' | 'released' | 'error'): void {
    this.requestLogger.debug(`Database connection ${event}`, {
      connectionId,
      event,
    });
  }

  // Log transaction events
  logTransaction(
    connectionId: number,
    event: 'begin' | 'commit' | 'rollback' | 'error',
    duration?: number
  ): void {
    this.requestLogger.debug(`Database transaction ${event}`, {
      connectionId,
      event,
      duration,
    });
  }

  // Log slow queries
  logSlowQuery(
    query: string,
    duration: number,
    threshold: number = 1000
  ): void {
    if (duration > threshold) {
      this.requestLogger.warn('Slow query detected', {
        query: this.sanitizeQuery(query),
        duration,
        threshold,
      });
    }
  }

  // Log query errors
  logQueryError(
    query: string,
    error: Error,
    params: any[] = [],
    connectionId?: number
  ): void {
    this.requestLogger.error('Database query error', error, {
      query: this.sanitizeQuery(query),
      params: params.length > 0 ? params : undefined,
      connectionId,
      queryType: this.getQueryType(query),
    });
  }

  // Extract query type from SQL
  private getQueryType(query: string): string {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.startsWith('select')) return 'select';
    if (trimmed.startsWith('insert')) return 'insert';
    if (trimmed.startsWith('update')) return 'update';
    if (trimmed.startsWith('delete')) return 'delete';
    if (trimmed.startsWith('create')) return 'create';
    if (trimmed.startsWith('alter')) return 'alter';
    if (trimmed.startsWith('drop')) return 'drop';
    if (trimmed.startsWith('truncate')) return 'truncate';
    return 'unknown';
  }

  // Extract table name from query
  private extractTableName(query: string): string {
    const trimmed = query.trim().toLowerCase();
    
    // Simple regex patterns to extract table names
    const patterns = [
      /from\s+`?(\w+)`?/i,
      /into\s+`?(\w+)`?/i,
      /update\s+`?(\w+)`?/i,
      /table\s+`?(\w+)`?/i,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return 'unknown';
  }

  // Sanitize query for logging (remove sensitive data)
  private sanitizeQuery(query: string): string {
    // Remove password fields
    let sanitized = query.replace(/password\s*=\s*['"][^'"]*['"]/gi, "password='[REDACTED]'");
    
    // Remove other sensitive fields
    const sensitiveFields = ['token', 'secret', 'key', 'auth'];
    for (const field of sensitiveFields) {
      const regex = new RegExp(`${field}\\s*=\\s*['"][^'"]*['"]`, 'gi');
      sanitized = sanitized.replace(regex, `${field}='[REDACTED]'`);
    }

    return sanitized;
  }
}

// Create database logger instance
export const dbLogger = new DatabaseLogger();

// Wrapper for Pool to add logging
export class LoggedPool {
  private poolInstance: Pool;
  private logger: DatabaseLogger;

  constructor(pool: Pool, logger: DatabaseLogger = dbLogger) {
    this.poolInstance = pool;
    this.logger = logger;
  }

  // Wrap getConnection with logging
  async getConnection(): Promise<PoolConnection> {
    const start = Date.now();
    try {
      const connection = await this.poolInstance.getConnection();
      const duration = Date.now() - start;
      
      this.logger.logConnection(connection.threadId, 'acquired');
      
      // Wrap connection methods
      return this.wrapConnection(connection);
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.logConnection(0, 'error');
      throw error;
    }
  }

  // Wrap connection methods
  private wrapConnection(connection: PoolConnection): PoolConnection {
    const originalExecute = connection.execute.bind(connection);
    const originalQuery = connection.query.bind(connection);

    // Wrap execute method
    (connection as any).execute = async (sql: string, values?: any) => {
      const start = Date.now();
      try {
        const result = await originalExecute(sql, values);
        const duration = Date.now() - start;
        
        this.logger.logQuery(sql, values, duration, connection.threadId);
        this.logger.logSlowQuery(sql, duration);
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        this.logger.logQueryError(sql, error as Error, values, connection.threadId);
        throw error;
      }
    };

    // Wrap query method
    (connection as any).query = async (sql: string, values?: any) => {
      const start = Date.now();
      try {
        const result = await originalQuery(sql, values);
        const duration = Date.now() - start;
        
        this.logger.logQuery(sql, values, duration, connection.threadId);
        this.logger.logSlowQuery(sql, duration);
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        this.logger.logQueryError(sql, error as Error, values, connection.threadId);
        throw error;
      }
    };

    // Wrap release method
    const originalRelease = connection.release.bind(connection);
    connection.release = () => {
      this.logger.logConnection(connection.threadId, 'released');
      return originalRelease();
    };

    return connection;
  }

  // Delegate other methods to original pool
  async query(sql: string, values?: any) {
    const start = Date.now();
    try {
      const result = await this.poolInstance.query(sql, values);
      const duration = Date.now() - start;
      
      this.logger.logQuery(sql, values, duration);
      this.logger.logSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.logQueryError(sql, error as Error, values);
      throw error;
    }
  }

  async execute(sql: string, values?: any) {
    const start = Date.now();
    try {
      const result = await this.poolInstance.execute(sql, values);
      const duration = Date.now() - start;
      
      this.logger.logQuery(sql, values, duration);
      this.logger.logSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.logQueryError(sql, error as Error, values);
      throw error;
    }
  }

  // Delegate other pool methods
  get pool() {
    return this.poolInstance;
  }

  end() {
    return this.poolInstance.end();
  }

  on(event: 'enqueue', listener: () => any): this;
  on(event: string, listener: (...args: any[]) => void): this {
    this.poolInstance.on(event as any, listener);
    return this;
  }

  off(event: string, listener: (...args: any[]) => void) {
    return this.poolInstance.off(event, listener);
  }

  emit(event: string, ...args: any[]) {
    return this.poolInstance.emit(event, ...args);
  }
}

// Transaction wrapper with logging
export class LoggedTransaction {
  private connection: PoolConnection;
  private logger: DatabaseLogger;
  private startTime: number = 0;

  constructor(connection: PoolConnection, logger: DatabaseLogger = dbLogger) {
    this.connection = connection;
    this.logger = logger;
  }

  async begin(): Promise<void> {
    this.startTime = Date.now();
    this.logger.logTransaction(this.connection.threadId, 'begin');
    await this.connection.execute('START TRANSACTION');
  }

  async commit(): Promise<void> {
    const duration = Date.now() - this.startTime;
    this.logger.logTransaction(this.connection.threadId, 'commit', duration);
    await this.connection.execute('COMMIT');
  }

  async rollback(): Promise<void> {
    const duration = Date.now() - this.startTime;
    this.logger.logTransaction(this.connection.threadId, 'rollback', duration);
    await this.connection.execute('ROLLBACK');
  }

  async execute(sql: string, values?: any) {
    const start = Date.now();
    try {
      const result = await this.connection.execute(sql, values);
      const duration = Date.now() - start;
      
      this.logger.logQuery(sql, values, duration, this.connection.threadId);
      this.logger.logSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.logQueryError(sql, error as Error, values, this.connection.threadId);
      throw error;
    }
  }

  async query(sql: string, values?: any) {
    const start = Date.now();
    try {
      const result = await this.connection.query(sql, values);
      const duration = Date.now() - start;
      
      this.logger.logQuery(sql, values, duration, this.connection.threadId);
      this.logger.logSlowQuery(sql, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.logQueryError(sql, error as Error, values, this.connection.threadId);
      throw error;
    }
  }
}

export default {
  DatabaseLogger,
  LoggedPool,
  LoggedTransaction,
  dbLogger,
};
