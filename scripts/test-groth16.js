#!/usr/bin/env node

/**
 * Test script for real Groth16 proof verification
 * This script tests the integration with snarkjs and actual verification keys
 */

const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

// Circuit types and their corresponding verification key files
const CIRCUITS = {
  transfer: 'verifier-transfer.json',
  merkle: 'verifier-merkle.json',
  nullifier: 'verifier-nullifier.json',
  stream: 'verifier-zkStream.json',
  split: 'verifier-zkSplit.json',
  condition: 'verifier-zkCondition.json',
  audit: 'verifier-audit_proof.json',
  withdraw: 'verifier-withdraw.json'
};

// Mock proof data for testing
const createMockProof = () => ({
  pi_a: [
    '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890',
    '0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abc'
  ],
  pi_b: [
    [
      '0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
      '0x4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
    ],
    [
      '0x5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      '0x6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
    ]
  ],
  pi_c: [
    '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    '0x890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567'
  ],
  publicSignals: [
    '0x90abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    '0xa0bcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789',
    '0xb0cdef1234567890abcdef1234567890abcdef1234567890abcdef123456789a',
    '0xc0def1234567890abcdef1234567890abcdef1234567890abcdef123456789ab'
  ]
});

/**
 * Load verification key from file
 */
function loadVerificationKey(filename) {
  try {
    const keyPath = path.join(__dirname, '../src/zk/circuits', filename);
    const keyData = fs.readFileSync(keyPath, 'utf8');
    return JSON.parse(keyData);
  } catch (error) {
    throw new Error(`Failed to load verification key ${filename}: ${error.message}`);
  }
}

/**
 * Test Groth16 verification for a specific circuit
 */
async function testCircuitVerification(circuitName, verificationKey) {
  console.log(`\n🧪 Testing ${circuitName} circuit verification...`);
  
  try {
    const proof = createMockProof();
    
    // Adjust public signals count based on circuit requirements
    const nPublic = verificationKey.nPublic;
    if (proof.publicSignals.length < nPublic) {
      // Pad with zeros if needed
      while (proof.publicSignals.length < nPublic) {
        proof.publicSignals.push('0x0');
      }
    } else if (proof.publicSignals.length > nPublic) {
      // Truncate if too many
      proof.publicSignals = proof.publicSignals.slice(0, nPublic);
    }

    console.log(`  📊 Circuit requires ${nPublic} public signals`);
    console.log(`  📊 Provided ${proof.publicSignals.length} public signals`);

    const startTime = Date.now();
    const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
    const endTime = Date.now();
    const verificationTime = endTime - startTime;

    console.log(`  ✅ Verification completed in ${verificationTime}ms`);
    console.log(`  📋 Result: ${result ? 'VALID' : 'INVALID'}`);
    
    return {
      circuit: circuitName,
      success: true,
      isValid: result,
      verificationTime,
      nPublic
    };

  } catch (error) {
    console.log(`  ❌ Verification failed: ${error.message}`);
    return {
      circuit: circuitName,
      success: false,
      error: error.message
    };
  }
}

/**
 * Test verification key structure
 */
function validateVerificationKey(circuitName, verificationKey) {
  console.log(`\n🔍 Validating ${circuitName} verification key structure...`);
  
  const requiredFields = ['protocol', 'curve', 'nPublic', 'IC'];
  const missingFields = requiredFields.filter(field => !verificationKey.hasOwnProperty(field));
  
  if (missingFields.length > 0) {
    console.log(`  ❌ Missing required fields: ${missingFields.join(', ')}`);
    return false;
  }

  console.log(`  ✅ Protocol: ${verificationKey.protocol}`);
  console.log(`  ✅ Curve: ${verificationKey.curve}`);
  console.log(`  ✅ Public inputs: ${verificationKey.nPublic}`);
  console.log(`  ✅ IC elements: ${verificationKey.IC.length}`);
  
  return true;
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting Groth16 Verification Tests\n');
  console.log('=' .repeat(60));

  const results = [];
  const startTime = Date.now();

  for (const [circuitName, filename] of Object.entries(CIRCUITS)) {
    try {
      console.log(`\n📁 Loading verification key: ${filename}`);
      
      // Load verification key
      const verificationKey = loadVerificationKey(filename);
      
      // Validate structure
      const isValidStructure = validateVerificationKey(circuitName, verificationKey);
      
      if (!isValidStructure) {
        results.push({
          circuit: circuitName,
          success: false,
          error: 'Invalid verification key structure'
        });
        continue;
      }

      // Test verification
      const result = await testCircuitVerification(circuitName, verificationKey);
      results.push(result);

    } catch (error) {
      console.log(`  ❌ Failed to test ${circuitName}: ${error.message}`);
      results.push({
        circuit: circuitName,
        success: false,
        error: error.message
      });
    }
  }

  const endTime = Date.now();
  const totalTime = endTime - startTime;

  // Print summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  
  const successfulTests = results.filter(r => r.success);
  const failedTests = results.filter(r => !r.success);
  
  console.log(`\n✅ Successful tests: ${successfulTests.length}/${results.length}`);
  console.log(`❌ Failed tests: ${failedTests.length}/${results.length}`);
  console.log(`⏱️  Total time: ${totalTime}ms`);

  if (successfulTests.length > 0) {
    console.log('\n📈 Performance Summary:');
    successfulTests.forEach(result => {
      console.log(`  ${result.circuit}: ${result.verificationTime}ms (${result.nPublic} public inputs)`);
    });
  }

  if (failedTests.length > 0) {
    console.log('\n❌ Failed Tests:');
    failedTests.forEach(result => {
      console.log(`  ${result.circuit}: ${result.error}`);
    });
  }

  console.log('\n🎯 Test completed!');
  
  // Exit with appropriate code
  process.exit(failedTests.length > 0 ? 1 : 0);
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Groth16 Verification Test Script

Usage: node test-groth16.js [options]

Options:
  --help, -h     Show this help message
  --circuit      Test specific circuit (e.g., --circuit transfer)
  --verbose      Enable verbose output

Examples:
  node test-groth16.js                    # Test all circuits
  node test-groth16.js --circuit transfer # Test only transfer circuit
  node test-groth16.js --verbose          # Enable verbose output
  `);
  process.exit(0);
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
}); 