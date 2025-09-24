/**
 * Configuration for canonical tree initialization
 */

export const TREE_CONFIG = {
  // Tree parameters
  DEPTH: 16, // 2^16 = 65,536 leaves
  TREE_ID: 1, // Single canonical tree
  
  // Zero values
  ZERO_LEAF: '0x0000000000000000000000000000000000000000000000000000000000000000',
  
  // Database configuration
  DATABASE: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: process.env.DB_PORT || 3306,
    USER: process.env.DB_USER || 'root',
    PASSWORD: process.env.DB_PASSWORD || 'root',
    NAME: process.env.DB_NAME || 'cipherpay',
    CONNECTION_LIMIT: 10,
  },
  
  // Performance settings
  BATCH_SIZE: 1000, // Number of records to insert per batch
  
  // Tree statistics
  get TOTAL_LEAVES() {
    return Math.pow(2, this.DEPTH);
  },
  
  get TOTAL_NODES() {
    return Math.pow(2, this.DEPTH + 1) - 1;
  },
  
  get TREE_SIZE_MB() {
    // Rough estimate: each node ~100 bytes, each leaf ~50 bytes
    const nodeSize = this.TOTAL_NODES * 100;
    const leafSize = this.TOTAL_LEAVES * 50;
    return Math.round((nodeSize + leafSize) / (1024 * 1024));
  }
};

export default TREE_CONFIG;
