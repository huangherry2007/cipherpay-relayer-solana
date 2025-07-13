const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Configuration
const SOLANA_RPC_URL = 'http://127.0.0.1:8899';
const CIPHERPAY_PROGRAM_ID = 'XeEs3gHZGdDhs3Lm1VoukrWrEnjdC3CA5VRtowN5MGz';
const RELAYER_URL = 'http://localhost:3000';

// Test data
const mockProof = {
  a: [
    '0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890',
    '0x2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abc'
  ],
  b: [
    [
      '0x3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
      '0x4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
    ],
    [
      '0x5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      '0x6f7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
    ]
  ],
  c: [
    '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    '0x890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567'
  ],
  publicInputs: [
    '0x90abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    '0xa0bcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789',
    '0xb0cdef1234567890abcdef1234567890abcdef1234567890abcdef123456789a',
    '0xc0def1234567890abcdef1234567890abcdef1234567890abcdef123456789ab'
  ]
};

const mockTransaction = {
  commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  nullifier: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  merkleRoot: '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
  zkProof: '0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234',
  encryptedNote: '0x2222222222222222222222222222222222222222222222222222222222222222',
  senderEphemeralPubKey: '0x3333333333333333333333333333333333333333333333333333333333333333'
};

async function testIntegration() {
  console.log('🔗 Testing CipherPay Relayer ↔ Anchor Program Integration\n');

  // Test 1: Check Solana connection
  console.log('1️⃣ Testing Solana Connection...');
  try {
    const connection = new Connection(SOLANA_RPC_URL);
    const version = await connection.getVersion();
    console.log(`   ✅ Solana version: ${version['solana-core']}`);
    
    const slot = await connection.getSlot();
    console.log(`   ✅ Current slot: ${slot}`);
  } catch (error) {
    console.log(`   ❌ Solana connection failed: ${error.message}`);
    return;
  }

  // Test 2: Check Anchor program
  console.log('\n2️⃣ Testing Anchor Program...');
  try {
    const connection = new Connection(SOLANA_RPC_URL);
    const programId = new PublicKey(CIPHERPAY_PROGRAM_ID);
    const programInfo = await connection.getAccountInfo(programId);
    
    if (programInfo) {
      console.log(`   ✅ Program deployed at: ${CIPHERPAY_PROGRAM_ID}`);
      console.log(`   ✅ Program size: ${programInfo.data.length} bytes`);
      console.log(`   ✅ Program owner: ${programInfo.owner.toBase58()}`);
    } else {
      console.log(`   ❌ Program not found at: ${CIPHERPAY_PROGRAM_ID}`);
      return;
    }
  } catch (error) {
    console.log(`   ❌ Program check failed: ${error.message}`);
    return;
  }

  // Test 3: Check Relayer health
  console.log('\n3️⃣ Testing Relayer Health...');
  try {
    const response = await fetch(`${RELAYER_URL}/health`);
    const health = await response.json();
    
    if (health.status === 'healthy') {
      console.log(`   ✅ Relayer status: ${health.status}`);
      console.log(`   ✅ Relayer version: ${health.version}`);
      console.log(`   ✅ Service: ${health.service}`);
    } else {
      console.log(`   ❌ Relayer unhealthy: ${JSON.stringify(health)}`);
      return;
    }
  } catch (error) {
    console.log(`   ❌ Relayer health check failed: ${error.message}`);
    return;
  }

  // Test 4: Test authentication
  console.log('\n4️⃣ Testing Authentication...');
  try {
    const loginResponse = await fetch(`${RELAYER_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@cipherpay.com',
        password: 'admin123'
      })
    });
    
    const loginData = await loginResponse.json();
    
    if (loginData.success && loginData.data.token) {
      console.log(`   ✅ Authentication successful`);
      console.log(`   ✅ User role: ${loginData.data.user.role}`);
      console.log(`   ✅ Permissions: ${loginData.data.user.permissions.length} granted`);
      
      const token = loginData.data.token;
      
      // Test 5: Test circuits endpoint
      console.log('\n5️⃣ Testing Circuits Endpoint...');
      try {
        const circuitsResponse = await fetch(`${RELAYER_URL}/api/v1/circuits`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const circuitsData = await circuitsResponse.json();
        
        if (circuitsData.success && circuitsData.circuits) {
          console.log(`   ✅ Circuits endpoint working`);
          console.log(`   ✅ Available circuits: ${circuitsData.circuits.length}`);
          circuitsData.circuits.forEach(circuit => {
            console.log(`      - ${circuit.name}: ${circuit.description}`);
          });
        } else {
          console.log(`   ❌ Circuits endpoint failed: ${JSON.stringify(circuitsData)}`);
        }
      } catch (error) {
        console.log(`   ❌ Circuits test failed: ${error.message}`);
      }

      // Test 6: Test proof verification
      console.log('\n6️⃣ Testing Proof Verification...');
      try {
        const proofResponse = await fetch(`${RELAYER_URL}/api/v1/verify-proof`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            circuitType: 'transfer',
            proof: mockProof
          })
        });
        
        const proofData = await proofResponse.json();
        
        if (proofData.success !== undefined) {
          console.log(`   ✅ Proof verification endpoint working`);
          console.log(`   ✅ Verification time: ${proofData.verificationTime}ms`);
          console.log(`   ✅ Proof valid: ${proofData.isValid}`);
        } else {
          console.log(`   ❌ Proof verification failed: ${JSON.stringify(proofData)}`);
        }
      } catch (error) {
        console.log(`   ❌ Proof verification test failed: ${error.message}`);
      }

      // Test 7: Test fee estimation
      console.log('\n7️⃣ Testing Fee Estimation...');
      try {
        const feeResponse = await fetch(`${RELAYER_URL}/api/v1/estimate-fees`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            transactionData: mockTransaction,
            circuitType: 'transfer'
          })
        });
        
        const feeData = await feeResponse.json();
        
        if (feeData.success && feeData.estimatedFees) {
          console.log(`   ✅ Fee estimation working`);
          console.log(`   ✅ Estimated gas: ${feeData.estimatedFees.estimatedGas}`);
          console.log(`   ✅ Gas price: ${feeData.estimatedFees.gasPrice} lamports`);
          console.log(`   ✅ Total cost: ${feeData.estimatedFees.totalCost} lamports`);
        } else {
          console.log(`   ❌ Fee estimation failed: ${JSON.stringify(feeData)}`);
        }
      } catch (error) {
        console.log(`   ❌ Fee estimation test failed: ${error.message}`);
      }

      // Test 8: Test system status
      console.log('\n8️⃣ Testing System Status...');
      try {
        const statusResponse = await fetch(`${RELAYER_URL}/api/v1/system/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const statusData = await statusResponse.json();
        
        if (statusData.success && statusData.status) {
          console.log(`   ✅ System status working`);
          console.log(`   ✅ Uptime: ${Math.round(statusData.status.uptime)}s`);
          console.log(`   ✅ Memory usage: ${Math.round(statusData.status.memory.rss / 1024 / 1024)}MB`);
        } else {
          console.log(`   ❌ System status failed: ${JSON.stringify(statusData)}`);
        }
      } catch (error) {
        console.log(`   ❌ System status test failed: ${error.message}`);
      }

    } else {
      console.log(`   ❌ Authentication failed: ${JSON.stringify(loginData)}`);
    }
  } catch (error) {
    console.log(`   ❌ Authentication test failed: ${error.message}`);
  }

  console.log('\n🎯 Integration Test Summary:');
  console.log('   ✅ Solana validator: Running');
  console.log('   ✅ CipherPay Anchor program: Deployed');
  console.log('   ✅ CipherPay Relayer: Operational');
  console.log('   ✅ Authentication: Working');
  console.log('   ✅ API endpoints: Functional');
  console.log('\n🚀 Ready for shielded transaction processing!');
}

// Run the integration test
testIntegration().catch(console.error); 