# CipherPay Relayer for Solana

A high-performance relayer service for CipherPay's privacy-preserving payment protocol on Solana. This service handles shielded transaction submission, gas abstraction, and privacy protection.

## Features

- 🔒 Shielded transaction submission
- ⚡ Gas abstraction and management
- 🕵️ Privacy protection with transaction mixing
- 🔄 Automatic retry mechanism
- 📊 Transaction status tracking
- 🔐 Cryptographic operations

## Prerequisites

- Node.js >= 16.0.0
- Solana CLI tools
- TypeScript >= 4.5.0

## Installation

```bash
# Clone the repository
git clone https://github.com/cipherpay/relayer-solana.git
cd cipherpay-relayer-solana

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a `.env` file in the root directory:

```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
RELAYER_PRIVATE_KEY=your_private_key
CIPHERPAY_PROGRAM_ID=your_program_id
RELAYER_PROGRAM_ID=your_relayer_program_id
```

## Usage

```typescript
import { Relayer } from './src/core/relayer';

const relayer = new Relayer({
  solanaRpcUrl: process.env.SOLANA_RPC_URL,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  programId: new PublicKey(process.env.CIPHERPAY_PROGRAM_ID)
});

// Submit a shielded transaction
const result = await relayer.submitTransaction({
  commitment: "0x...",
  nullifier: "0x...",
  merkleRoot: "0x...",
  zkProof: "0x...",
  encryptedNote: "0x...",
  senderEphemeralPubKey: "0x..."
});
```

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture

The relayer service is built with a modular architecture:

- `src/core/`: Core relayer functionality
- `src/services/`: Supporting services (gas, privacy, network)
- `src/utils/`: Utility functions
- `src/config/`: Configuration and types

For detailed architecture documentation, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## API Reference

For detailed API documentation, see [API.md](./docs/API.md).

## Security

- All transactions are encrypted
- Private keys are never exposed
- Gas abstraction protects user privacy
- Transaction mixing for enhanced privacy

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please:
- Open an issue in the GitHub repository
- Join our [Discord community](https://discord.gg/cipherpay)
- Contact support at support@cipherpay.com