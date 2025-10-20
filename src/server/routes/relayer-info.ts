/* ESM */
// src/server/routes/relayer-info.ts
import { Router } from "express";
import { solanaRelayer } from "@/services/solana-relayer.js";

export const relayerInfo = Router();

relayerInfo.get("/info", async (_req, res) => {
  try {
    const relayerPubkey = solanaRelayer.provider.wallet.publicKey.toBase58();
    const programId     = solanaRelayer.program.programId.toBase58();
    const clusterUrl    = (solanaRelayer.provider.connection as any)._rpcEndpoint ?? "";
    return res.json({ relayerPubkey, programId, clusterUrl });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "InternalError", message: e?.message || String(e) });
  }
});

export default relayerInfo;
