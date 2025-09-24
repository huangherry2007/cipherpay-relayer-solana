# Canonical Tree Initialization

This directory contains scripts for initializing the canonical Merkle tree in the CipherPay relayer.

## 🌳 Tree Structure

The canonical tree is a **Poseidon-based Merkle tree** with:
- **Depth**: 16 levels (2^16 = 65,536 leaves)
- **All leaves**: Zero values (`0x0000...`)
- **Intermediate nodes**: `Poseidon(left, right)`
- **Root**: Computed from bottom-up using Poseidon hashing

## 📁 Files

- **`init-canonical-tree.js`** - Main initialization script
- **`tree-config.js`** - Configuration parameters
- **`README-tree-init.md`** - This documentation

## 🚀 Usage

### Prerequisites

1. **MySQL Database**: Ensure the `cipherpay` database exists
2. **Environment Variables**: Set database connection details
3. **Dependencies**: Install required packages

```bash
# Install dependencies
npm install

# Set environment variables (optional)
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=cipherpay
```

### Initialize Tree

```bash
# Run the initialization script
npm run init-tree

# Or run directly
node scripts/init-canonical-tree.js
```

## 🗄️ Database Schema

The script works with existing tables created by migrations:

### `merkle_meta`
- Stores tree configuration and current state
- Fields: `tree_id`, `k` (key), `v` (value as VARBINARY)
- Keys: `depth`, `next_index`, `root`, `zero`

### `nodes`
- Stores all tree nodes (intermediate and root)
- Fields: `tree_id`, `layer`, `index`, `fe` (BINARY), `fe_hex` (CHAR)

### `leaves`
- Stores all tree leaves (commitments)
- Fields: `tree_id`, `index`, `fe` (BINARY), `fe_hex` (CHAR)

### `roots`
- Ring buffer cache of roots for telemetry
- Fields: `id`, `tree_id`, `fe` (BINARY), `fe_hex` (CHAR), `created_at`

## 📊 Tree Statistics

- **Total Leaves**: 65,536 (2^16)
- **Total Nodes**: 131,071 (2^17 - 1)
- **Estimated Size**: ~10 MB
- **Tree ID**: 1 (single canonical tree)

## 🔧 Configuration

Edit `tree-config.js` to modify:
- Tree depth
- Database connection
- Batch size for inserts
- Zero leaf value

## ⚠️ Important Notes

1. **One-time Setup**: This script should only be run once during initial setup
2. **Data Loss**: Running the script will clear existing tree data
3. **Performance**: Initialization may take several minutes for large trees
4. **Backup**: Consider backing up your database before running

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check MySQL is running
   - Verify connection credentials
   - Ensure database exists

2. **Poseidon Hash Error**
   - Check `circomlibjs` is installed
   - Verify Node.js version compatibility

3. **Memory Issues**
   - Reduce batch size in config
   - Increase Node.js memory limit: `node --max-old-space-size=4096`

### Logs

The script provides detailed logging:
- ✅ Success operations
- ❌ Error messages
- 📊 Progress updates
- 🔍 Verification results

## 🔄 Next Steps

After initialization:
1. **Verify Tree**: Check database tables are populated
2. **Test Operations**: Run tests to ensure tree works correctly
3. **Start Relayer**: Begin processing transactions
4. **Monitor**: Use monitoring dashboard to track tree operations

## 📚 Related Documentation

- [Merkle Tree Implementation](../src/services/merkle/)
- [Database Schema](../migrations/)
- [API Documentation](../docs/api.md)
- [Monitoring Guide](../docs/monitoring.md)
