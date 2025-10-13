// scripts/parse-events.mjs
/**
export PROGRAM_ID=56nPWpjBLbh1n8vvUdCYGmg3dS5zNwLW9UhCg4MMpBmN
export SOLANA_URL=http://127.0.0.1:8899

node scripts/parse-events.mjs 3KncqDcd5QnqZ9GSBfkprYaTmNWXDC45Qs9QAwFvYxxv6ytBGaJZ2oVjZe55mFQQrtyi1wVsP9x25bTT4qFFub5M
*/
import * as anchor from "@coral-xyz/anchor";
import { web3, BorshCoder, EventParser } from "@coral-xyz/anchor";
import fs from "node:fs";
import idl from "../src/idl/cipherpay_anchor.json" with { type: "json" };

const RPC = process.env.SOLANA_URL || "http://127.0.0.1:8899";
const SIG = process.argv[2];
const PROGRAM_ID = new web3.PublicKey(process.env.PROGRAM_ID || idl.address);

function localWallet() {
  const p = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")));
  const kp = web3.Keypair.fromSecretKey(secret);
  return new anchor.Wallet(kp);
}

async function main() {
  if (!SIG) {
    console.error("Usage: node scripts/parse-events.mjs <tx-signature>");
    process.exit(1);
  }

  const connection = new web3.Connection(RPC, "confirmed");
  // We do NOT construct new Program(...); just need a coder
  const coder = new BorshCoder(idl);

  const tx = await connection.getTransaction(SIG, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.error("No transaction found (wrong signature / RPC?).");
    process.exit(1);
  }
  if (!tx.meta?.logMessages) {
    console.error("Transaction has no logs.");
    process.exit(1);
  }

  console.log("— raw logs —");
  for (const l of tx.meta.logMessages) console.log(l);

  console.log("\n— parsed Anchor events —");
  const parser = new EventParser(PROGRAM_ID, coder);
  let found = false;
  for (const ev of parser.parseLogs(tx.meta.logMessages)) {
    found = true;
    console.log(`event: ${ev.name}`);
    console.dir(ev.data, { depth: 6 });
  }
  if (!found) {
    console.log("No Anchor events parsed. Likely the deployed program/IDL has no events or IDs don’t match.");
    console.log("IDL events present:", (idl.events || []).map(e => e.name));
  }
}

main().catch((e) => {
  console.error("parse-events error:", e?.stack || e);
  process.exit(1);
});
