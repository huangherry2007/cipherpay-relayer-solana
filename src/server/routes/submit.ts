// src/server/routes/submit.ts
import { Router } from "express";
import { ProofVerifier } from "@/zk/proof-verifier.js";
import { SolanaRelayer } from "@/services/solana-relayer.js";
import { PublicKey } from "@solana/web3.js";
import { 
  validateDepositRequest, 
  validateTransferRequest, 
  validateWithdrawRequest,
  handleApiError,
  ValidationError,
  ProofVerificationError,
  SolanaTransactionError
} from "@/utils/validation.js";

export function submitRouter(verifier: ProofVerifier, relayer: SolanaRelayer) {
  const r = Router();

  r.post("/deposit", async (req, res, next) => {
    try {
      // Validate request data
      const validatedData = validateDepositRequest(req.body);
      const { proof, publicSignals, depositHash, commitment } = validatedData;
      
      // Convert publicSignals to the expected type
      const signals = publicSignals.map((s: string | number) => typeof s === 'number' ? s.toString() : s);
      
      // Verify the proof
      try {
        await verifier.verify("deposit", proof, signals);
      } catch (error) {
        throw new ProofVerificationError(`Proof verification failed: ${error}`, "deposit");
      }
      
      // Process the shielded deposit through Solana
      let txSignature: string;
      try {
        txSignature = await relayer.processShieldedDeposit(
          Buffer.from(depositHash, 'hex'),
          proof,
          signals,
          Buffer.from(commitment, 'hex')
        );
      } catch (error) {
        throw new SolanaTransactionError(`Solana transaction failed: ${error}`);
      }
      
      return res.json({ 
        ok: true, 
        accepted: true, 
        txSignature,
        message: "Deposit processed successfully"
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/transfer", async (req, res, next) => {
    try {
      // Validate request data
      const validatedData = validateTransferRequest(req.body);
      const { proof, publicSignals, nullifier, out1Commitment, out2Commitment } = validatedData;
      
      // Convert publicSignals to the expected type
      const signals = publicSignals.map((s: string | number) => typeof s === 'number' ? s.toString() : s);
      
      // Verify the proof
      try {
        await verifier.verify("transfer", proof, signals);
      } catch (error) {
        throw new ProofVerificationError(`Proof verification failed: ${error}`, "transfer");
      }
      
      // Process the shielded transfer through Solana
      let txSignature: string;
      try {
        txSignature = await relayer.processShieldedTransfer(
          Buffer.from(nullifier, 'hex'),
          proof,
          signals,
          Buffer.from(out1Commitment, 'hex'),
          Buffer.from(out2Commitment, 'hex')
        );
      } catch (error) {
        throw new SolanaTransactionError(`Solana transaction failed: ${error}`);
      }
      
      return res.json({ 
        ok: true, 
        accepted: true, 
        txSignature,
        message: "Transfer processed successfully"
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/withdraw", async (req, res, next) => {
    try {
      // Validate request data
      const validatedData = validateWithdrawRequest(req.body);
      const { proof, publicSignals, nullifier, recipient, amount, mint } = validatedData;
      
      // Convert publicSignals to the expected type
      const signals = publicSignals.map((s: string | number) => typeof s === 'number' ? s.toString() : s);
      
      // Verify the proof
      try {
        await verifier.verify("withdraw", proof, signals);
      } catch (error) {
        throw new ProofVerificationError(`Proof verification failed: ${error}`, "withdraw");
      }
      
      // Process the shielded withdraw through Solana
      let txSignature: string;
      try {
        txSignature = await relayer.processShieldedWithdraw(
          Buffer.from(nullifier, 'hex'),
          proof,
          signals,
          new PublicKey(recipient),
          BigInt(amount),
          new PublicKey(mint)
        );
      } catch (error) {
        throw new SolanaTransactionError(`Solana transaction failed: ${error}`);
      }
      
      return res.json({ 
        ok: true, 
        accepted: true, 
        txSignature,
        message: "Withdraw processed successfully"
      });
    } catch (e) {
      next(e);
    }
  });

  // Additional endpoints for Solana integration
  r.get("/status/:txSignature", async (req, res, next) => {
    try {
      const { txSignature } = req.params;
      const status = await relayer.getTransactionStatus(txSignature);
      return res.json({ ok: true, status });
    } catch (e) {
      next(e);
    }
  });

  r.get("/merkle/root", async (req, res, next) => {
    try {
      const root = await relayer.getCurrentRoot();
      return res.json({ ok: true, root: root.toString('hex') });
    } catch (e) {
      next(e);
    }
  });


  // Add error handling middleware
  r.use(handleApiError);

  return r;
}
