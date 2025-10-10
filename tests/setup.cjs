// Jest global setup (CommonJS) to avoid ESM parsing issues

// Silence noisy logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Test environment variables
process.env.NODE_ENV = 'test';
process.env.RELAYER_PORT = '3001';
process.env.VKEY_DIR = './test-vkeys';
process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_USER = 'root';
process.env.MYSQL_PASSWORD = 'root';
process.env.MYSQL_DATABASE = 'cipherpay_test';
process.env.SOLANA_RPC_URL = 'http://127.0.0.1:8899';
process.env.PROGRAM_ID = '9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o';
process.env.AUTH_MODE = 'jwt';
process.env.AUTH_JWT_ISSUER = 'test-issuer';
process.env.AUTH_JWT_AUDIENCE = 'test-audience';
process.env.AUTH_JWKS_URL = 'https://test.example.com/.well-known/jwks.json';
process.env.AUTH_JWT_PUBLIC_PEM = 'test-public-key';

// Increase timeout for slow tests
jest.setTimeout(30000);


