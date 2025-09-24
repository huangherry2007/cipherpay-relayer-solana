// src/server/routes/prepare.ts
import { Router } from "express";
import { CanonicalTree } from "@/services/merkle/canonical-tree.js";
import { toBig, bigIntToLe32, feHex } from "@/utils/bytes.js";

export function prepareRouter(tree: CanonicalTree) {
  const r = Router();

  // POST /v1/prepare/deposit
  // body: { commitment: string (bigint), treeId?: number }
  r.post("/deposit", async (req, res, next) => {
    try {
      const { commitment } = req.body;
      if (!commitment) return res.status(400).json({ error: "missing commitment" });
      const fe = toBig(commitment);

      // the deposit circuit proves path to ZERO leaf; for append we only need next index
      const { nextIndex } = await tree.getRoot();
      return res.json({
        nextLeafIndex: nextIndex,
        // for strict-sync deposit circuit that needs old path: supply dynamic proof to zero-tree
        // optional: pathElements/pathIndices for leaf=0 at nextIndex (all zeros path)
      });
    } catch (e) {
      next(e);
    }
  });

  // POST /v1/prepare/transfer
  // body: { inCommitment: string, out1Commitment: string }
  r.post("/transfer", async (req, res, next) => {
    try {
      const { inCommitment, out1Commitment } = req.body;
      if (!inCommitment || !out1Commitment) return res.status(400).json({ error: "missing args" });

      // membership against canonical tree
      const proofIn = await tree.getProofByCommitment(toBig(inCommitment));

      // append preview for out1 (at current nextIndex)
      const { nextIndex } = await tree.getRoot();
      const proofOut1 = await tree.getProofByIndex(nextIndex);

      return res.json({
        inPathElements: proofIn.pathElements.map((b: Buffer) => b.toString("hex")),
        inPathIndices: proofIn.pathIndices,
        out1PathElements: proofOut1.pathElements.map((b: Buffer) => b.toString("hex")),
        out1PathIndices: proofOut1.pathIndices,
        nextLeafIndex: nextIndex,
      });
    } catch (e) {
      next(e);
    }
  });

  // POST /v1/prepare/withdraw
  // body: { spendCommitment: string }
  r.post("/withdraw", async (req, res, next) => {
    try {
      const { spendCommitment } = req.body;
      if (!spendCommitment) return res.status(400).json({ error: "missing spendCommitment" });

      const proof = await tree.getProofByCommitment(toBig(spendCommitment));
      const { root } = await tree.getRoot();
      return res.json({
        merkleRoot: root.toString("hex"),
        pathElements: proof.pathElements.map((b: Buffer) => b.toString("hex")),
        pathIndices: proof.pathIndices,
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
