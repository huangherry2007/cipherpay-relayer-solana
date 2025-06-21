# 🚀 Build, Test, and Run Guide

This document provides comprehensive instructions for building, testing, and running the CipherPay Relayer Solana project.

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Setup & Installation](#-setup--installation)
- [Building the Project](#-building-the-project)
- [Testing](#-testing)
- [Running the Application](#-running-the-application)
- [Verification & Monitoring](#-verification--monitoring)
- [Troubleshooting](#-troubleshooting)
- [Production Deployment](#-production-deployment)
- [Next Steps](#-next-steps)

## 🔧 Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

- **Node.js** >= 16.0.0
- **npm** or **yarn**
- **Git**

### Optional Software

- **Solana CLI tools** (for local testing and keypair generation)
- **Docker** and **Docker Compose** (for containerized deployment)
- **PM2** (for production process management)

### Verify Installation

```bash
# Check Node.js version
node --version  # Should be >= 16.0.0

# Check npm version
npm --version

# Check Git version
git --version

# Check Solana CLI (optional)
solana --version

# Check Docker (optional)
docker --version
docker-compose --version
```

## 🛠️ Setup & Installation

### 1. Clone and Navigate to Project

```bash
# Navigate to the project directory
cd cipherpay-relayer-solana

# Verify you're in the correct directory
ls -la
# Should show: package.json, src/, docs/, etc.
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# Verify installation
npm list --depth=0
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Create environment file
touch .env
```

Add the following configuration to your `.env` file:

```env
# =============================================================================
# SOLANA CONFIGURATION
# =============================================================================
SOLANA_RPC_URL=https://api.devnet.solana.com
RELAYER_PRIVATE_KEY=your_private_key_here
CIPHERPAY_PROGRAM_ID=your_program_id_here
RELAYER_PROGRAM_ID=your_relayer_program_id_here

# =============================================================================
# AUTHENTICATION CONFIGURATION
# =============================================================================
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000

# =============================================================================
# SERVER CONFIGURATION
# =============================================================================
PORT=3000
NODE_ENV=development

# =============================================================================
# CORS CONFIGURATION
# =============================================================================
CORS_ORIGIN=*

# =============================================================================
# RATE LIMITING
# =============================================================================
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Generate Solana Keypair (if needed)

```bash
# Generate a new Solana keypair for testing
solana-keygen new --outfile relayer-keypair.json

# Get the public key
solana-keygen pubkey relayer-keypair.json

# Get the private key in base58 format (for .env file)
cat relayer-keypair.json | jq -r '.[0:64]' | base58

# Or use this command to get the full private key
cat relayer-keypair.json
```

### 5. Verify Project Structure

```bash
# Check project structure
tree -L 2 -I 'node_modules|.git'

# Expected structure:
# cipherpay-relayer-solana/
# ├── docs/
# ├── scripts/
# ├── src/
# ├── tests/
# ├── .env
# ├── .gitignore
# ├── docker-compose.yml
# ├── Dockerfile
# ├── jest.config.js
# ├── package.json
# ├── README.md
# └── tsconfig.json
```

## 🏗️ Building the Project

### Build for Production

```bash
# Clean previous builds
rm -rf dist/

# Build TypeScript to JavaScript
npm run build

# Verify build output
ls -la dist/
# Should show compiled JavaScript files

# Check for build errors
npm run build 2>&1 | grep -i error
```

### Build for Development

```bash
# No separate build needed for development
# TypeScript is compiled on-the-fly with ts-node

# Verify TypeScript compilation
npx tsc --noEmit
```

### Build with Docker

```bash
# Build Docker image
docker build -t cipherpay-relayer-solana:latest .

# Verify image was created
docker images | grep cipherpay-relayer-solana
```

## 🧪 Testing

### Run All Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with verbose output
npm test -- --verbose
```

### Run Specific Test Categories

```bash
# Test authentication flow
npm test -- --testNamePattern="Auth"

# Test permission validation
npm test -- --testNamePattern="Permissions"

# Test rate limiting
npm test -- --testNamePattern="RateLimit"

# Test Groth16 verification
npm test -- --testNamePattern="Groth16"

# Test transaction handling
npm test -- --testNamePattern="Transaction"

# Test proof verification
npm test -- --testNamePattern="Proof"
```

### Run Groth16 Verification Tests

```bash
# Test all circuits
npm run test:groth16

# Test with verbose output
node scripts/test-groth16.js --verbose

# Test specific circuit
node scripts/test-groth16.js --circuit transfer
node scripts/test-groth16.js --circuit merkle
node scripts/test-groth16.js --circuit nullifier

# Test all circuits with detailed output
node scripts/test-groth16.js --verbose --all
```

### Code Quality Checks

```bash
# Lint code
npm run lint

# Fix linting issues automatically
npm run lint -- --fix

# Format code
npm run format

# Check for TypeScript errors
npx tsc --noEmit

# Run all quality checks
npm run lint && npm run format && npx tsc --noEmit
```

### Test Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# View coverage in browser (if available)
open coverage/lcov-report/index.html

# Check coverage thresholds
npm test -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}'
```

## 🚀 Running the Application

### Development Mode

```bash
# Start in development mode with hot reload
npm run dev

# The server will start on http://localhost:3000
# You should see output like:
# Server running on port 3000
# CipherPay Relayer Solana started successfully
```

### Production Mode

```bash
# Build first
npm run build

# Start production server
npm start

# The server will start on http://localhost:3000
```

### Using Docker

```bash
# Build and run with Docker Compose
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build --force-recreate
```

### Using Docker for Development

```bash
# Run with local Solana validator for testing
docker-compose --profile dev up --build

# This will start:
# - CipherPay Relayer Solana on port 3000
# - Local Solana validator on port 8899
```

### Using PM2 (Production Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name "cipherpay-relayer"

# Monitor processes
pm2 monit

# View logs
pm2 logs cipherpay-relayer

# Restart application
pm2 restart cipherpay-relayer

# Stop application
pm2 stop cipherpay-relayer

# Delete application from PM2
pm2 delete cipherpay-relayer
```

## 🔍 Verification & Monitoring

### 1. Health Check

```bash
# Check if the server is running
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "cipherpay-relayer-solana",
  "version": "0.1.0"
}
```

### 2. Authentication Test

```bash
# Test login with default admin user
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cipherpay.com",
    "password": "admin123"
  }'

# Expected response:
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-uuid",
      "email": "admin@cipherpay.com",
      "role": "admin",
      "permissions": ["*"]
    }
  }
}

# Test with other default users
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "operator@cipherpay.com",
    "password": "operator123"
  }'

curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "readonly@cipherpay.com",
    "password": "readonly123"
  }'
```

### 3. System Status Check

```bash
# Get system status (requires authentication)
TOKEN="your_jwt_token_here"
curl -X GET http://localhost:3000/api/v1/system/status \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "0.1.0",
    "circuits": {
      "transfer": "active",
      "merkle": "active",
      "nullifier": "active"
    },
    "relayer": {
      "balance": "10.5 SOL",
      "pendingTransactions": 5,
      "lastTransaction": "2024-01-01T12:00:00Z"
    }
  }
}
```

### 4. Circuit Information

```bash
# Get supported circuits
curl -X GET http://localhost:3000/api/v1/circuits \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
{
  "success": true,
  "data": {
    "circuits": [
      {
        "name": "transfer",
        "description": "Private transfer verification",
        "inputs": ["commitment", "nullifier", "merkleRoot"],
        "verificationKey": "verifier-transfer.json"
      }
    ]
  }
}
```

## 📊 Monitoring and Logs

### View Application Logs

```bash
# View logs in development
npm run dev

# View logs in production
tail -f combined.log
tail -f error.log

# View Docker logs
docker-compose logs -f cipherpay-relayer-solana

# View PM2 logs
pm2 logs cipherpay-relayer
```

### Monitor System Metrics

```bash
# Get system metrics
curl -X GET http://localhost:3000/api/v1/system/metrics \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
{
  "success": true,
  "data": {
    "transactions": {
      "total": 1500,
      "successful": 1480,
      "failed": 20,
      "pending": 5
    },
    "proofs": {
      "verified": 1500,
      "invalid": 5,
      "averageVerificationTime": 12.5
    },
    "gas": {
      "totalSpent": "25.5 SOL",
      "averagePerTransaction": "0.017 SOL"
    }
  }
}
```

### Performance Monitoring

```bash
# Monitor CPU and memory usage
top -p $(pgrep -f "node.*cipherpay")

# Monitor network connections
netstat -tulpn | grep :3000

# Monitor disk usage
df -h
du -sh .
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
sudo kill -9 $(lsof -t -i:3000)

# Or change PORT in .env file
echo "PORT=3001" >> .env
```

#### 2. Missing Dependencies

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force
npm install
```

#### 3. TypeScript Compilation Errors

```bash
# Check TypeScript configuration
npx tsc --noEmit

# Fix linting issues
npm run lint -- --fix

# Check for missing type definitions
npm install @types/node @types/express
```

#### 4. Authentication Issues

```bash
# Check JWT secret is set
echo $JWT_SECRET

# Verify environment variables
cat .env | grep JWT

# Test JWT token generation
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({test: 'data'}, 'test-secret');
console.log('JWT test:', token);
"
```

#### 5. Solana Connection Issues

```bash
# Test Solana RPC connection
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://api.devnet.solana.com

# Check Solana CLI connection
solana config get
solana cluster-version
```

#### 6. Groth16 Verification Issues

```bash
# Check circuit files exist
ls -la src/zk/circuits/

# Test Groth16 verification manually
node scripts/test-groth16.js --circuit transfer --verbose

# Check snarkjs installation
npm list snarkjs
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=cipherpay:* npm run dev

# Enable specific debug categories
DEBUG=cipherpay:auth npm run dev
DEBUG=cipherpay:groth16 npm run dev
DEBUG=cipherpay:relayer npm run dev

# Enable all debug logging
DEBUG=* npm run dev
```

### Log Analysis

```bash
# Search for errors in logs
grep -i error combined.log
grep -i error error.log

# Search for specific patterns
grep "authentication" combined.log
grep "proof verification" combined.log

# Monitor logs in real-time
tail -f combined.log | grep -i error
```

## 🚀 Production Deployment

### Environment Variables for Production

```bash
# Production .env
NODE_ENV=production
PORT=3000
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
JWT_SECRET=your-very-long-and-random-secret-key-here
CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com
RATE_LIMIT_MAX_REQUESTS=1000
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_DURATION=1800000
```

### Security Checklist

- [ ] Change default passwords immediately
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable HTTPS with proper SSL certificates
- [ ] Configure proper CORS settings for your domains
- [ ] Set up monitoring and alerting
- [ ] Use Redis for rate limiting (recommended)
- [ ] Implement audit logging
- [ ] Regular security updates
- [ ] Backup strategy for logs and data
- [ ] Firewall configuration

### Using PM2 in Production

```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'cipherpay-relayer',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Using Docker in Production

```bash
# Build production image
docker build -t cipherpay-relayer-solana:latest .

# Run with environment variables
docker run -d \
  --name cipherpay-relayer \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
  -e JWT_SECRET=your-secret \
  -e CORS_ORIGIN=https://yourdomain.com \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  cipherpay-relayer-solana:latest

# Using Docker Compose for production
docker-compose -f docker-compose.prod.yml up -d
```

### Load Balancing and Scaling

```bash
# Using Nginx as reverse proxy
sudo apt-get install nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/cipherpay-relayer

# Enable site
sudo ln -s /etc/nginx/sites-available/cipherpay-relayer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 📚 Next Steps

### Immediate Actions

1. **Configure your Solana program IDs** in the environment
2. **Set up proper authentication** with strong JWT secrets
3. **Configure CORS** for your frontend domains
4. **Test with real Groth16 proofs** from your circuits
5. **Set up monitoring and alerting**

### Advanced Configuration

1. **Database Integration**: Replace in-memory storage with persistent database
2. **Redis Integration**: Use Redis for rate limiting and session management
3. **Audit Logging**: Implement comprehensive audit trail
4. **Token Refresh**: Add automatic token refresh mechanism
5. **Multi-factor Authentication**: Implement 2FA for enhanced security

### Integration

1. **Frontend Integration**: Connect your web application
2. **SDK Integration**: Use the CipherPay SDK for client applications
3. **Monitoring Tools**: Set up Prometheus, Grafana, or similar
4. **CI/CD Pipeline**: Automate testing and deployment
5. **Backup Strategy**: Implement data backup and recovery

### Performance Optimization

1. **Circuit Optimization**: Optimize Groth16 circuit verification
2. **Caching Strategy**: Implement Redis caching for frequently accessed data
3. **Connection Pooling**: Optimize database and RPC connections
4. **Load Testing**: Test with realistic load scenarios
5. **Performance Monitoring**: Set up APM tools

## 📖 Additional Resources

- [API Reference](./API.md)
- [Authentication Guide](./AUTHENTICATION.md)
- [Groth16 Integration Guide](./GROTH16_INTEGRATION.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [Authentication Implementation Summary](./AUTH_IMPLEMENTATION_SUMMARY.md)

## 🆘 Support

For additional support:

- **GitHub Issues**: [Create an issue](https://github.com/cipherpay/relayer-solana/issues)
- **Discord Community**: [Join our Discord](https://discord.gg/cipherpay)
- **Email Support**: support@cipherpay.com
- **Documentation**: [CipherPay Docs](https://docs.cipherpay.com)

---

**Happy building! 🚀**

The CipherPay Relayer Solana is now ready to handle shielded transactions with comprehensive authentication, authorization, and Groth16 zero-knowledge proof verification! 