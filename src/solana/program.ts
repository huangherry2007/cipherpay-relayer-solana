// src/solana/program.ts
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import type { CipherpayAnchor } from "../../target/types/cipherpay_anchor.js";
import { loadEnv } from "@/services/config/env.js";

export class SolanaProgram {
  public readonly program: Program<CipherpayAnchor & any>;
  public readonly provider: AnchorProvider;
  public readonly connection: Connection;
  public readonly programId: PublicKey;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.provider = new AnchorProvider(connection, wallet, {});
    this.programId = programId;
    
    // Initialize the program with the IDL
    this.program = new Program<CipherpayAnchor & any>(
      {} as any, // IDL will be loaded dynamically
      this.programId,
      this.provider
    );
  }

  static async create(env: any): Promise<SolanaProgram> {
    const connection = new Connection(env.solanaRpcUrl || "https://api.devnet.solana.com");
    
    // For now, create a dummy wallet - in production, this should be loaded from secure storage
    const wallet = new Wallet(Keypair.generate());
    
    // Program ID from the IDL
    const programId = new PublicKey("9dsJPKp8Z6TBtfbhHu1ssE8KSUMWUNUFAXy8SUxMuf9o");
    
    return new SolanaProgram(connection, wallet, programId);
  }

  // Get the program's tree PDA
  getTreePDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tree")],
      this.programId
    );
    return pda;
  }

  // Get the vault PDA
  getVaultPDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      this.programId
    );
    return pda;
  }

  // Get the root cache PDA
  getRootCachePDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("rootCache")],
      this.programId
    );
    return pda;
  }

  // Get nullifier PDA
  getNullifierPDA(nullifier: Buffer): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), nullifier],
      this.programId
    );
    return pda;
  }

  // Get deposit marker PDA
  getDepositMarkerPDA(depositHash: Buffer): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), depositHash],
      this.programId
    );
    return pda;
  }
}
