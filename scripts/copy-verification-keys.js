#!/usr/bin/env node

/**
 * Script to copy verification keys from cipherpay-circuits build directory
 * to cipherpay-relayer-solana src/zk/circuits directory
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Source and destination paths
const CIRCUITS_BUILD_DIR = '/home/sean/cipherpay-circuits/build';
const RELAYER_ZK_DIR = path.join(__dirname, '..', 'src', 'zk', 'circuits');

// Circuit types and their corresponding file names
const CIRCUITS = [
  { type: 'deposit', filename: 'deposit_vkey.json' },
  { type: 'transfer', filename: 'transfer_vkey.json' },
  { type: 'withdraw', filename: 'withdraw_vkey.json' }
];

const copyVerificationKeys = async () => {
  try {
    console.log('🔑 Starting verification key copy process...\n');

    // Ensure destination directory exists
    await fs.mkdir(RELAYER_ZK_DIR, { recursive: true });
    console.log(`✅ Created destination directory: ${RELAYER_ZK_DIR}`);

    let successCount = 0;
    let errorCount = 0;

    for (const circuit of CIRCUITS) {
      const sourcePath = path.join(CIRCUITS_BUILD_DIR, circuit.type, 'verification_key.json');
      const destPath = path.join(RELAYER_ZK_DIR, circuit.filename);

      try {
        // Check if source file exists
        await fs.access(sourcePath);
        
        // Copy the file
        await fs.copyFile(sourcePath, destPath);
        
        // Verify the copy was successful
        const sourceStats = await fs.stat(sourcePath);
        const destStats = await fs.stat(destPath);
        
        if (sourceStats.size === destStats.size) {
          console.log(`✅ Copied ${circuit.type} verification key: ${circuit.filename}`);
          console.log(`   Source: ${sourcePath}`);
          console.log(`   Destination: ${destPath}`);
          console.log(`   Size: ${sourceStats.size} bytes\n`);
          successCount++;
        } else {
          throw new Error(`File size mismatch: source=${sourceStats.size}, dest=${destStats.size}`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`❌ Source file not found: ${sourcePath}`);
        } else {
          console.log(`❌ Error copying ${circuit.type} verification key:`, error.message);
        }
        errorCount++;
      }
    }

    // Summary
    console.log('📊 Copy Summary:');
    console.log(`   ✅ Successfully copied: ${successCount} files`);
    console.log(`   ❌ Failed to copy: ${errorCount} files`);
    
    if (successCount === CIRCUITS.length) {
      console.log('\n🎉 All verification keys copied successfully!');
    } else if (successCount > 0) {
      console.log('\n⚠️  Some verification keys were copied successfully.');
    } else {
      console.log('\n💥 No verification keys were copied. Please check the source directory.');
    }

  } catch (error) {
    console.error('💥 Fatal error during copy process:', error.message);
    process.exit(1);
  }
};

// Run the script
copyVerificationKeys();
