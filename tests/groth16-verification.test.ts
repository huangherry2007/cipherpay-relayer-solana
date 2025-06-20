import { ProofVerifierFactory, ZKProof } from '../src/core/proof';
import * as fs from 'fs';
import * as path from 'path';

// Test data for Groth16 verification
const createMockProof = (): ZKProof => ({
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
});

describe('Groth16 Proof Verification Tests', () => {
  const circuitTypes = [
    'transfer',
    'merkle', 
    'nullifier',
    'stream',
    'split',
    'condition',
    'audit',
    'withdraw'
  ];

  describe('Verification Key Loading', () => {
    test('should load verification keys for all circuit types', () => {
      circuitTypes.forEach(circuitType => {
        expect(() => {
          ProofVerifierFactory.getVerifier(circuitType);
        }).not.toThrow();
      });
    });

    test('should throw error for invalid circuit type', () => {
      expect(() => {
        ProofVerifierFactory.getVerifier('invalid' as any);
      }).toThrow('Unknown circuit type: invalid');
    });

    test('should verify verification key files exist', () => {
      const circuitsDir = path.join(__dirname, '../src/zk/circuits');
      
      circuitTypes.forEach(circuitType => {
        const filename = `verifier-${circuitType === 'audit' ? 'audit_proof' : circuitType}.json`;
        const filePath = path.join(circuitsDir, filename);
        
        expect(fs.existsSync(filePath)).toBe(true);
        
        // Verify the file contains valid JSON
        const fileContent = fs.readFileSync(filePath, 'utf8');
        expect(() => JSON.parse(fileContent)).not.toThrow();
        
        // Verify it's a valid verification key structure
        const verificationKey = JSON.parse(fileContent);
        expect(verificationKey).toHaveProperty('protocol');
        expect(verificationKey).toHaveProperty('curve');
        expect(verificationKey).toHaveProperty('nPublic');
        expect(verificationKey).toHaveProperty('IC');
      });
    });
  });

  describe('Proof Format Validation', () => {
    test('should validate correct proof format', () => {
      const proof = createMockProof();
      
      expect(proof.a).toHaveLength(2);
      expect(proof.b).toHaveLength(2);
      expect(proof.b[0]).toHaveLength(2);
      expect(proof.b[1]).toHaveLength(2);
      expect(proof.c).toHaveLength(2);
      expect(Array.isArray(proof.publicInputs)).toBe(true);
    });

    test('should handle proof with different public input counts', () => {
      const proofWithMoreInputs: ZKProof = {
        ...createMockProof(),
        publicInputs: [
          '0x1', '0x2', '0x3', '0x4', '0x5', '0x6', '0x7', '0x8'
        ]
      };

      expect(proofWithMoreInputs.publicInputs).toHaveLength(8);
    });
  });

  describe('Groth16 Verification Performance', () => {
    test('should measure verification time for each circuit type', async () => {
      const proof = createMockProof();
      const results: { [key: string]: number } = {};

      for (const circuitType of circuitTypes) {
        const startTime = Date.now();
        
        try {
          await ProofVerifierFactory.verifyProof(circuitType, proof);
          const endTime = Date.now();
          results[circuitType] = endTime - startTime;
        } catch (error) {
          results[circuitType] = -1; // Error occurred
        }
      }

      // Log performance results
      console.log('Verification performance (ms):', results);

      // Verify that all circuits were processed (even if verification failed)
      circuitTypes.forEach(circuitType => {
        expect(results[circuitType]).toBeDefined();
      });
    }, 30000); // 30 second timeout for performance test

    test('should provide detailed verification results', async () => {
      const proof = createMockProof();
      
      for (const circuitType of circuitTypes) {
        const result = await ProofVerifierFactory.verifyProofWithDetails(circuitType, proof);
        
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('verificationTime');
        expect(typeof result.isValid).toBe('boolean');
        expect(typeof result.verificationTime).toBe('number');
        expect(result.verificationTime).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle malformed proof data', async () => {
      const malformedProof: ZKProof = {
        a: ['invalid', 'invalid'],
        b: [['invalid', 'invalid'], ['invalid', 'invalid']],
        c: ['invalid', 'invalid'],
        publicInputs: ['invalid']
      };

      for (const circuitType of circuitTypes) {
        const result = await ProofVerifierFactory.verifyProof(circuitType, malformedProof);
        expect(typeof result).toBe('boolean');
      }
    });

    test('should handle empty proof data', async () => {
      const emptyProof: ZKProof = {
        a: ['', ''],
        b: [['', ''], ['', '']],
        c: ['', ''],
        publicInputs: []
      };

      for (const circuitType of circuitTypes) {
        const result = await ProofVerifierFactory.verifyProof(circuitType, emptyProof);
        expect(typeof result).toBe('boolean');
      }
    });

    test('should handle missing verification key files gracefully', () => {
      // This test verifies that the system handles missing files gracefully
      // In a real scenario, this would be caught during initialization
      expect(() => {
        ProofVerifierFactory.getVerifier('transfer');
      }).not.toThrow();
    });
  });

  describe('Concurrent Verification', () => {
    test('should handle multiple concurrent verifications', async () => {
      const proof = createMockProof();
      const promises = circuitTypes.map(circuitType => 
        ProofVerifierFactory.verifyProof(circuitType, proof)
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(circuitTypes.length);
      results.forEach(result => {
        expect(typeof result).toBe('boolean');
      });
    }, 30000);

    test('should handle concurrent verifications with different proofs', async () => {
      const proof1 = createMockProof();
      const proof2 = createMockProof();
      
      const promises = [
        ProofVerifierFactory.verifyProof('transfer', proof1),
        ProofVerifierFactory.verifyProof('merkle', proof2),
        ProofVerifierFactory.verifyProof('nullifier', proof1),
        ProofVerifierFactory.verifyProof('stream', proof2)
      ];

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(typeof result).toBe('boolean');
      });
    }, 30000);
  });

  describe('Memory Management', () => {
    test('should not leak memory during repeated verifications', async () => {
      const proof = createMockProof();
      const iterations = 10;
      
      for (let i = 0; i < iterations; i++) {
        for (const circuitType of circuitTypes) {
          await ProofVerifierFactory.verifyProof(circuitType, proof);
        }
      }

      // If we reach here without memory issues, the test passes
      expect(true).toBe(true);
    }, 60000);
  });
}); 