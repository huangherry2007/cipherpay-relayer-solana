/* ESM */
import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import fs from "node:fs";
import idl from "@/idl/cipherpay_anchor.json" with { type: "json" };
import TxManager from "@/solana/tx-manager.js";

type AnyIdl = Record<string, any>;

function makeProvider(): AnchorProvider {
  const url =
    process.env.ANCHOR_PROVIDER_URL ||
    process.env.SOLANA_URL ||
    "http://127.0.0.1:8899";

  const walletPath =
    process.env.ANCHOR_WALLET ||
    `${process.env.HOME}/.config/solana/id.json`;

  const secret = Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf8")));
  const kp = web3.Keypair.fromSecretKey(secret);

  const connection = new web3.Connection(url, "confirmed");
  const wallet = new anchor.Wallet(kp);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function makeProgram(provider: AnchorProvider): Program {
  const idlObj = idl as AnyIdl;
  const programIdStr: string = process.env.PROGRAM_ID || idlObj.address;
  if (!programIdStr) {
    throw new Error("PROGRAM_ID not set and IDL.address missing");
  }
  if (idlObj.address !== programIdStr) idlObj.address = programIdStr;
  return new Program(idlObj as unknown as anchor.Idl, provider);
}

export type DepositBinArgs = {
  amount: bigint;
  tokenMint: string;            // base58
  proofBytes: Buffer;           // 256 bytes
  publicInputsBytes: Buffer;    // 7 * 32 bytes
};

class SolanaRelayer {
  readonly provider: AnchorProvider;
  readonly program: Program;
  readonly txm: TxManager;

  constructor() {
    this.provider = makeProvider();
    this.program = makeProgram(this.provider);
    this.txm = new TxManager({
      program: this.program,
      provider: this.provider,
      connection: this.provider.connection,
    });
  }

  async submitDepositWithBin(args: DepositBinArgs) {
    const mint = new web3.PublicKey(args.tokenMint);
    const sig = await this.txm.submitShieldedDepositAtomicBytes({
      mint,
      amount: args.amount,
      proofBytes: args.proofBytes,
      publicInputsBytes: args.publicInputsBytes,
    });
    return { signature: sig };
  }
}

export const solanaRelayer = new SolanaRelayer();
