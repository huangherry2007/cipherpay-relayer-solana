// src/services/solana-relayer.ts
import { PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  SolanaProgram,
  TxManager,
  EventWatcher,
  type SolanaEvent,
} from "@/solana/index.js";
import { ProofVerifier } from "@/zk/proof-verifier.js";
import { CanonicalTree } from "@/services/merkle/canonical-tree.js";
import { getMintTokenProgramId } from "@/solana/tokenProgram.js";

export interface RelayerConfig {
  solanaRpcUrl: string;
  programId: string;
  vkeyDir: string;
  payerPrivateKey?: string; // Base58 encoded private key
}

type DepositArgs = {
  mint: PublicKey;
  amount: bigint;                              // base units (lamports for WSOL)
  depositHash: Buffer;                         // 32 bytes
  commitment: Buffer;                          // 32 bytes (not sent in this tx)
  proof: any;                                  // snarkjs proof json
  publicSignals: (string | bigint)[];          // public inputs
};

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
    this.txManager = new TxManager({
      program: program.program!,
      provider: program.provider,
      connection: program.connection,
    });
    this.eventWatcher = new EventWatcher(program);
    this.proofVerifier = proofVerifier;
    this.tree = tree;
  }

  static async create(
    _config: RelayerConfig,
    proofVerifier: ProofVerifier,
    tree: CanonicalTree
  ): Promise<SolanaRelayer> {
    const program = await SolanaProgram.create();
    const payer = Keypair.generate().publicKey; // dev-only
    return new SolanaRelayer(program, proofVerifier, tree, payer);
  }

  /** PDA used by on-chain program as the vault authority for a given mint. */
  private vaultAuthorityForMint(mint: PublicKey): PublicKey {
    return this.program.getVaultPDA(mint);
  }

  /** Derive the vault authority PDA and its ATA for `mint`. */
  private async deriveVaultAccounts(mint: PublicKey): Promise<{
    vaultAuthority: PublicKey;
    vaultTokenAccount: PublicKey;
  }> {
    const vaultAuthority = this.vaultAuthorityForMint(mint);
    const tokenProgramId = await getMintTokenProgramId(this.program.connection, mint);
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mint,
      vaultAuthority,
      true, // owner is a PDA
      tokenProgramId
    );
    return { vaultAuthority, vaultTokenAccount };
  }

  // ------------------- SHIELDED OPS -------------------

  async processShieldedDeposit(args: DepositArgs): Promise<string> {
    const { mint, amount, depositHash, proof, publicSignals /*, commitment*/ } = args;

    try {
      // Defensive off-chain verify (server route also verifies)
      const signals = publicSignals.map((s) =>
        typeof s === "bigint" ? s.toString() : s
      );
      await this.proofVerifier.verify("deposit", proof, signals);

      // Do not mutate DB-tree here; update after on-chain event.

      // Derive PDAs/ATAs
      const { vaultAuthority, vaultTokenAccount } = await this.deriveVaultAccounts(mint);
      void vaultAuthority;

      // Hand raw proof + signals to TxManager so it can try alternate packings
      const txSignature = await this.txManager.submitShieldedDepositAtomic({
        depositHash,
        proof,
        publicSignals: signals,
        mint,
        vaultTokenAccount,
        amount, // used for WSOL pre-fund/sync if native mint
      });

      return txSignature;
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as Error).message
          : String(error);
      throw new Error(`Failed to process shielded deposit: ${message}`);
    }
  }

  async processShieldedTransfer(
    nullifier: Buffer,
    proof: any,
    publicSignals: (string | bigint)[],
    out1Commitment: Buffer,
    out2Commitment: Buffer
  ): Promise<string> {
    try {
      const signals = publicSignals.map((s) =>
        typeof s === "bigint" ? s.toString() : s
      );
      await this.proofVerifier.verify("transfer", proof, signals);

      // (transfer still uses single packing in your current program; keep as-is)
      // If needed, mirror the multi-packing approach here later.
      // TODO: Implement callShieldedTransfer in TxManager
      throw new Error("callShieldedTransfer not yet implemented");
      /*const txSignature = await this.txManager.callShieldedTransfer({
        nullifier,
        // Pack LE by default for arkworks; adjust if needed later.
        proofBytes: (() => {
          const ax = BigInt(proof.pi_a[0]);
          const ay = BigInt(proof.pi_a[1]);
          const bx0 = BigInt(proof.pi_b[0][0]);
          const bx1 = BigInt(proof.pi_b[0][1]);
          const by0 = BigInt(proof.pi_b[1][0]);
          const by1 = BigInt(proof.pi_b[1][1]);
          const cx = BigInt(proof.pi_c[0]);
          const cy = BigInt(proof.pi_c[1]);
          const le32 = (n: bigint) =>
            Buffer.from(n.toString(16).padStart(64, "0"), "hex").reverse();
          return Buffer.concat([
            le32(ax),
            le32(ay),
            le32(bx0),
            le32(bx1),
            le32(by0),
            le32(by1),
            le32(cx),
            le32(cy),
          ]);
        })(),
        publicInputsBytes: Buffer.concat(
          signals.map((s) =>
            Buffer.from(BigInt(s).toString(16).padStart(64, "0"), "hex").reverse()
          )
        ),
      });*/

      // return txSignature;
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as Error).message
          : String(error);
      throw new Error(`Failed to process shielded transfer: ${message}`);
    }
  }

  async processShieldedWithdraw(
    nullifier: Buffer,
    proof: any,
    publicSignals: (string | bigint)[],
    recipient: PublicKey,
    amount: bigint,
    mint: PublicKey
  ): Promise<string> {
    try {
      const signals = publicSignals.map((s) =>
        typeof s === "bigint" ? s.toString() : s
      );
      await this.proofVerifier.verify("withdraw", proof, signals);

      // LE pack (can extend to multi-packing if needed)
      const le32 = (n: bigint) =>
        Buffer.from(n.toString(16).padStart(64, "0"), "hex").reverse();
      const proofBytes = (() => {
        const ax = BigInt(proof.pi_a[0]);
        const ay = BigInt(proof.pi_a[1]);
        const bx0 = BigInt(proof.pi_b[0][0]);
        const bx1 = BigInt(proof.pi_b[0][1]);
        const by0 = BigInt(proof.pi_b[1][0]);
        const by1 = BigInt(proof.pi_b[1][1]);
        const cx = BigInt(proof.pi_c[0]);
        const cy = BigInt(proof.pi_c[1]);
        return Buffer.concat([
          le32(ax),
          le32(ay),
          le32(bx0),
          le32(bx1),
          le32(by0),
          le32(by1),
          le32(cx),
          le32(cy),
        ]);
      })();
      const publicInputsBytes = Buffer.concat(
        signals.map((s) => le32(BigInt(s)))
      );

      // TODO: Implement callShieldedWithdraw in TxManager
      throw new Error("callShieldedWithdraw not yet implemented");
      /*const txSignature = await this.txManager.callShieldedWithdraw({
        nullifier,
        proofBytes,
        publicInputsBytes,
        recipient,
        amount,
        mint,
      });*/

      // return txSignature;
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? (error as Error).message
          : String(error);
      throw new Error(`Failed to process shielded withdraw: ${message}`);
    }
  }

  // ------------------- EVENTS & UTILS -------------------

  startEventListening(callback: (event: SolanaEvent) => void) {
    this.eventWatcher.onAll(callback);
  }

  stopEventListening() {
    this.eventWatcher.stop();
  }

  async getTransactionStatus(signature: string) {
    // TODO: Implement getTransactionStatus in TxManager or use connection directly
    return await this.program.connection.getSignatureStatus(signature);
  }

  async getCurrentRoot(): Promise<Buffer> {
    return await this.tree.getRoot();
  }
}
