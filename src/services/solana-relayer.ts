// src/services/solana-relayer.ts
import { PublicKey, Keypair } from "@solana/web3.js";
import { SolanaProgram, TxManager, EventWatcher, type SolanaEvent } from "@/solana/index.js";
import { ProofVerifier } from "@/zk/proof-verifier.js";
import { CanonicalTree } from "@/services/merkle/canonical-tree.js";
import { loadEnv } from "@/services/config/env.js";

export interface RelayerConfig {
  solanaRpcUrl: string;
  programId: string;
  vkeyDir: string;
  payerPrivateKey?: string; // Base58 encoded private key
}

export class SolanaRelayer {
  private program: SolanaProgram;
  private txManager: TxManager;
  private eventWatcher: EventWatcher;
  private proofVerifier: ProofVerifier;
  private tree: CanonicalTree;

  constructor(
    program: SolanaProgram,
    proofVerifier: ProofVerifier,
    tree: CanonicalTree,
    payer: PublicKey
  ) {
    this.program = program;
    this.txManager = new TxManager(program, payer);
    this.eventWatcher = new EventWatcher(program);
    this.proofVerifier = proofVerifier;
    this.tree = tree;
  }

  static async create(
    config: RelayerConfig,
    proofVerifier: ProofVerifier,
    tree: CanonicalTree
  ): Promise<SolanaRelayer> {
    const env = loadEnv();
    const program = await SolanaProgram.create(env);
    
    // For now, use a dummy payer - in production, this should be loaded from secure storage
    const payer = Keypair.generate().publicKey;
    
    return new SolanaRelayer(program, proofVerifier, tree, payer);
  }

  // Process a shielded deposit
  async processShieldedDeposit(
    depositHash: Buffer,
    proof: any,
    publicSignals: (string | bigint)[],
    commitment: Buffer
  ): Promise<string> {
    try {
      // Verify the proof
      const signals = publicSignals.map(s => typeof s === 'bigint' ? s.toString() : s);
      await this.proofVerifier.verify("deposit", proof, signals);
      
      // Add commitment to the Merkle tree
      const commitmentBigInt = BigInt('0x' + commitment.toString('hex'));
      const { root } = await this.tree.append(commitmentBigInt);
      
      // Submit to Solana
      const txSignature = await this.txManager.submitShieldedDepositAtomic({
        depositHash,
        proofBytes: Buffer.from(JSON.stringify(proof)),
        publicInputsBytes: Buffer.from(JSON.stringify(publicSignals))
      });

      return txSignature;
    } catch (error) {
      const message = (error && typeof error === 'object' && 'message' in error)
        ? (error as Error).message
        : String(error);
      throw new Error(`Failed to process shielded deposit: ${message}`);
    }
  }

  // Process a shielded transfer
  async processShieldedTransfer(
    nullifier: Buffer,
    proof: any,
    publicSignals: (string | bigint)[],
    out1Commitment: Buffer,
    out2Commitment: Buffer
  ): Promise<string> {
    try {
      // Verify the proof
      const signals = publicSignals.map(s => typeof s === 'bigint' ? s.toString() : s);
      await this.proofVerifier.verify("transfer", proof, signals);
      
      // Add commitments to the Merkle tree
      const out1BigInt = BigInt('0x' + out1Commitment.toString('hex'));
      const out2BigInt = BigInt('0x' + out2Commitment.toString('hex'));
      const { root: root1 } = await this.tree.append(out1BigInt);
      const { root: root2 } = await this.tree.append(out2BigInt);
      
      // Submit to Solana
      const txSignature = await this.txManager.callShieldedTransfer({
        nullifier,
        proofBytes: Buffer.from(JSON.stringify(proof)),
        publicInputsBytes: Buffer.from(JSON.stringify(publicSignals))
      });

      return txSignature;
    } catch (error) {
      const message = (error && typeof error === 'object' && 'message' in error)
        ? (error as Error).message
        : String(error);
      throw new Error(`Failed to process shielded transfer: ${message}`);
    }
  }

  // Process a shielded withdraw
  async processShieldedWithdraw(
    nullifier: Buffer,
    proof: any,
    publicSignals: (string | bigint)[],
    recipient: PublicKey,
    amount: bigint,
    mint: PublicKey
  ): Promise<string> {
    try {
      // Verify the proof
      const signals = publicSignals.map(s => typeof s === 'bigint' ? s.toString() : s);
      await this.proofVerifier.verify("withdraw", proof, signals);
      
      // Submit to Solana
      const txSignature = await this.txManager.callShieldedWithdraw({
        nullifier,
        proofBytes: Buffer.from(JSON.stringify(proof)),
        publicInputsBytes: Buffer.from(JSON.stringify(publicSignals)),
        recipient,
        amount,
        mint
      });

      return txSignature;
    } catch (error) {
      const message = (error && typeof error === 'object' && 'message' in error)
        ? (error as Error).message
        : String(error);
      throw new Error(`Failed to process shielded withdraw: ${message}`);
    }
  }

  // Start listening for Solana events
  startEventListening(callback: (event: SolanaEvent) => void) {
    this.eventWatcher.onAll(callback);
  }

  // Stop listening for events
  stopEventListening() {
    this.eventWatcher.stop();
  }

  // Get transaction status
  async getTransactionStatus(signature: string) {
    return await this.txManager.getTransactionStatus(signature);
  }

  // Get current Merkle root
  async getCurrentRoot(): Promise<Buffer> {
    const { root } = await this.tree.getRoot();
    return root;
  }

}
