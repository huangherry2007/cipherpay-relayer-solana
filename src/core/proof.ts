import { PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as snarkjs from 'snarkjs';

export interface ZKProof {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicInputs: string[];
}

export interface CircuitVerifier {
  verifyProof(proof: ZKProof): Promise<boolean>;
}

export class TransferProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-transfer.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      // Convert proof to the format expected by snarkjs
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      // Verify the proof using snarkjs
      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('Transfer proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      // Use snarkjs to verify the Groth16 proof
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class MerkleProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-merkle.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('Merkle proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class NullifierProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-nullifier.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('Nullifier proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class ZKStreamProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-zkStream.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('ZK Stream proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class ZKSplitProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-zkSplit.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('ZK Split proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class ZKConditionProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-zkCondition.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('ZK Condition proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class AuditProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-audit_proof.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('Audit proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class WithdrawProofVerifier implements CircuitVerifier {
  private verificationKey: any;

  constructor() {
    this.loadVerificationKey('verifier-withdraw.json');
  }

  private loadVerificationKey(filename: string): void {
    try {
      const keyPath = path.join(__dirname, '../zk/circuits', filename);
      const keyData = fs.readFileSync(keyPath, 'utf8');
      this.verificationKey = JSON.parse(keyData);
    } catch (error) {
      throw new Error(`Failed to load verification key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyProof(proof: ZKProof): Promise<boolean> {
    try {
      const formattedProof = {
        pi_a: proof.a,
        pi_b: proof.b,
        pi_c: proof.c,
        publicSignals: proof.publicInputs
      };

      return await this.verifyGroth16Proof(formattedProof, this.verificationKey);
    } catch (error) {
      console.error('Withdraw proof verification failed:', error);
      return false;
    }
  }

  private async verifyGroth16Proof(proof: any, verificationKey: any): Promise<boolean> {
    try {
      const result = await snarkjs.groth16.verify(verificationKey, proof.publicSignals, proof);
      return result;
    } catch (error) {
      console.error('Groth16 verification failed:', error);
      return false;
    }
  }
}

export class ProofVerifierFactory {
  private static verifiers: Map<string, CircuitVerifier> = new Map();

  static getVerifier(circuitType: string): CircuitVerifier {
    if (this.verifiers.has(circuitType)) {
      return this.verifiers.get(circuitType)!;
    }

    let verifier: CircuitVerifier;

    switch (circuitType) {
      case 'transfer':
        verifier = new TransferProofVerifier();
        break;
      case 'merkle':
        verifier = new MerkleProofVerifier();
        break;
      case 'nullifier':
        verifier = new NullifierProofVerifier();
        break;
      case 'stream':
        verifier = new ZKStreamProofVerifier();
        break;
      case 'split':
        verifier = new ZKSplitProofVerifier();
        break;
      case 'condition':
        verifier = new ZKConditionProofVerifier();
        break;
      case 'audit':
        verifier = new AuditProofVerifier();
        break;
      case 'withdraw':
        verifier = new WithdrawProofVerifier();
        break;
      default:
        throw new Error(`Unknown circuit type: ${circuitType}`);
    }

    this.verifiers.set(circuitType, verifier);
    return verifier;
  }

  static async verifyProof(circuitType: string, proof: ZKProof): Promise<boolean> {
    const verifier = this.getVerifier(circuitType);
    return await verifier.verifyProof(proof);
  }

  static async verifyProofWithDetails(circuitType: string, proof: ZKProof): Promise<{
    isValid: boolean;
    verificationTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      const isValid = await this.verifyProof(circuitType, proof);
      const verificationTime = Date.now() - startTime;
      
      return {
        isValid,
        verificationTime
      };
    } catch (error) {
      const verificationTime = Date.now() - startTime;
      return {
        isValid: false,
        verificationTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
