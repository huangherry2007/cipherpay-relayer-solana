import { logger } from '@/utils/logger.js';

// Metrics collection interface
export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

// Counter metric
export class Counter {
  private value: number = 0;
  private labels: Record<string, string>;

  constructor(
    public name: string,
    labels: Record<string, string> = {}
  ) {
    this.labels = labels;
  }

  inc(amount: number = 1): void {
    this.value += amount;
    this.emit();
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  private emit(): void {
    logger.perf.debug({
      value: this.value,
      labels: this.labels,
      type: 'counter'
    }, `Counter ${this.name}`);
  }
}

// Gauge metric
export class Gauge {
  private value: number = 0;
  private labels: Record<string, string>;

  constructor(
    public name: string,
    labels: Record<string, string> = {}
  ) {
    this.labels = labels;
  }

  set(value: number): void {
    this.value = value;
    this.emit();
  }

  inc(amount: number = 1): void {
    this.value += amount;
    this.emit();
  }

  dec(amount: number = 1): void {
    this.value -= amount;
    this.emit();
  }

  get(): number {
    return this.value;
  }

  private emit(): void {
    logger.perf.debug({
      value: this.value,
      labels: this.labels,
      type: 'gauge'
    }, `Gauge ${this.name}`);
  }
}

// Histogram metric
export class Histogram {
  private values: number[] = [];
  private labels: Record<string, string>;

  constructor(
    public name: string,
    labels: Record<string, string> = {}
  ) {
    this.labels = labels;
  }

  observe(value: number): void {
    this.values.push(value);
    this.emit();
  }

  get(): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    if (this.values.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const count = this.values.length;
    const sum = this.values.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = this.percentile(sorted, 0.5);
    const p95 = this.percentile(sorted, 0.95);
    const p99 = this.percentile(sorted, 0.99);

    return { count, sum, avg, min, max, p50, p95, p99 };
  }

  reset(): void {
    this.values = [];
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private emit(): void {
    const stats = this.get();
    logger.perf.debug({
      ...stats,
      labels: this.labels,
      type: 'histogram'
    }, `Histogram ${this.name}`);
  }
}

// Timer metric
export class Timer {
  private startTime: number = 0;
  private labels: Record<string, string>;

  constructor(
    public name: string,
    labels: Record<string, string> = {}
  ) {
    this.labels = labels;
  }

  start(): void {
    this.startTime = Date.now();
  }

  end(): number {
    if (this.startTime === 0) {
      throw new Error('Timer not started');
    }
    const duration = Date.now() - this.startTime;
    this.startTime = 0;
    this.emit(duration);
    return duration;
  }

  private emit(duration: number): void {
    logger.perf.debug({
      duration,
      labels: this.labels,
      type: 'timer'
    }, `Timer ${this.name}`);
  }
}

// Metrics registry
export class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private timers: Map<string, Timer> = new Map();

  // Counter methods
  createCounter(name: string, labels: Record<string, string> = {}): Counter {
    const key = this.getKey(name, labels);
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, labels));
    }
    return this.counters.get(key)!;
  }

  getCounter(name: string, labels: Record<string, string> = {}): Counter {
    return this.createCounter(name, labels);
  }

  // Gauge methods
  createGauge(name: string, labels: Record<string, string> = {}): Gauge {
    const key = this.getKey(name, labels);
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, labels));
    }
    return this.gauges.get(key)!;
  }

  getGauge(name: string, labels: Record<string, string> = {}): Gauge {
    return this.createGauge(name, labels);
  }

  // Histogram methods
  createHistogram(name: string, labels: Record<string, string> = {}): Histogram {
    const key = this.getKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, labels));
    }
    return this.histograms.get(key)!;
  }

  getHistogram(name: string, labels: Record<string, string> = {}): Histogram {
    return this.createHistogram(name, labels);
  }

  // Timer methods
  createTimer(name: string, labels: Record<string, string> = {}): Timer {
    const key = this.getKey(name, labels);
    if (!this.timers.has(key)) {
      this.timers.set(key, new Timer(name, labels));
    }
    return this.timers.get(key)!;
  }

  getTimer(name: string, labels: Record<string, string> = {}): Timer {
    return this.createTimer(name, labels);
  }

  // Get all metrics
  getAllMetrics(): Metric[] {
    const metrics: Metric[] = [];
    const timestamp = Date.now();

    // Collect counter metrics
    for (const counter of this.counters.values()) {
      metrics.push({
        name: counter.name,
        value: counter.get(),
        timestamp,
        labels: (counter as any).labels,
      });
    }

    // Collect gauge metrics
    for (const gauge of this.gauges.values()) {
      metrics.push({
        name: gauge.name,
        value: gauge.get(),
        timestamp,
        labels: (gauge as any).labels,
      });
    }

    // Collect histogram metrics
    for (const histogram of this.histograms.values()) {
      const stats = histogram.get();
      metrics.push({
        name: `${histogram.name}_count`,
        value: stats.count,
        timestamp,
        labels: (histogram as any).labels,
      });
      metrics.push({
        name: `${histogram.name}_sum`,
        value: stats.sum,
        timestamp,
        labels: (histogram as any).labels,
      });
      metrics.push({
        name: `${histogram.name}_avg`,
        value: stats.avg,
        timestamp,
        labels: (histogram as any).labels,
      });
      metrics.push({
        name: `${histogram.name}_p95`,
        value: stats.p95,
        timestamp,
        labels: (histogram as any).labels,
      });
    }

    return metrics;
  }

  // Reset all metrics
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.reset();
    }
    for (const histogram of this.histograms.values()) {
      histogram.reset();
    }
  }

  private getKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}

// Global metrics registry
export const metrics = new MetricsRegistry();

// Predefined metrics
export const appMetrics = {
  // Request metrics
  httpRequestsTotal: (method: string, route: string, status: number) =>
    metrics.getCounter('http_requests_total', { method, route, status: status.toString() }),
  
  httpRequestDuration: (method: string, route: string) =>
    metrics.getHistogram('http_request_duration_ms', { method, route }),

  // Database metrics
  dbQueriesTotal: (operation: string, table: string) =>
    metrics.getCounter('db_queries_total', { operation, table }),
  
  dbQueryDuration: (operation: string, table: string) =>
    metrics.getHistogram('db_query_duration_ms', { operation, table }),

  // Solana metrics
  solanaTransactionsTotal: (operation: string, status: string) =>
    metrics.getCounter('solana_transactions_total', { operation, status }),
  
  solanaTransactionDuration: (operation: string) =>
    metrics.getHistogram('solana_transaction_duration_ms', { operation }),

  // Merkle tree metrics
  merkleOperationsTotal: (operation: string) =>
    metrics.getCounter('merkle_operations_total', { operation }),
  
  merkleOperationDuration: (operation: string) =>
    metrics.getHistogram('merkle_operation_duration_ms', { operation }),

  // Proof verification metrics
  proofVerificationsTotal: (circuit: string, status: string) =>
    metrics.getCounter('proof_verifications_total', { circuit, status }),
  
  proofVerificationDuration: (circuit: string) =>
    metrics.getHistogram('proof_verification_duration_ms', { circuit }),

  // System metrics
  activeConnections: () => metrics.getGauge('active_connections'),
  memoryUsage: () => metrics.getGauge('memory_usage_bytes'),
  cpuUsage: () => metrics.getGauge('cpu_usage_percent'),
};

export default metrics;
