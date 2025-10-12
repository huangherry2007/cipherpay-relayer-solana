// src/server/routes/prepare.ts
import { Router } from "express";
import { CanonicalTree } from "@/services/merkle/canonical-tree.js";
import { toBig } from "@/utils/bytes.js";

export function prepareRouter(tree: CanonicalTree) {
  const r = Router();

  // POST /api/v1/prepare/deposit
  // body: { commitment: string (bigint-like) }
  r.post("/deposit", async (req, res, next) => {
    try {
      const { commitment } = req.body ?? {};
      if (!commitment) return res.status(400).json({ error: "missing commitment" });
      toBig(commitment); // validate shape

      const { root, nextIndex } = await tree.getRootAndIndex();
      const zeroPath = await tree.getPathByIndex(nextIndex);

      res.json({
        merkleRoot: root.toString("hex"),
        nextLeafIndex: nextIndex,
        inPathElements: zeroPath.pathElements.map((b) => b.toString("hex")),
        inPathIndices: zeroPath.pathIndices,
      });
    } catch (e) { next(e); }
  });

  // POST /api/v1/prepare/transfer
  // body: { inCommitment: string, out1Commitment: string }
  r.post("/transfer", async (req, res, next) => {
    try {
      const { inCommitment, out1Commitment } = req.body ?? {};
      if (!inCommitment || !out1Commitment) {
        return res.status(400).json({ error: "missing args" });
      }

      const pathIn = await tree.getPathByCommitment(toBig(inCommitment));
      const { root, nextIndex } = await tree.getRootAndIndex();
      const pathOut1 = await tree.getPathByIndex(nextIndex);

      res.json({
        merkleRoot: root.toString("hex"),
        inPathElements: pathIn.pathElements.map((b) => b.toString("hex")),
        inPathIndices: pathIn.pathIndices,
        out1PathElements: pathOut1.pathElements.map((b) => b.toString("hex")),
        out1PathIndices: pathOut1.pathIndices,
        nextLeafIndex: nextIndex,
      });
    } catch (e) { next(e); }
  });

  // POST /api/v1/prepare/withdraw
  // body: { spendCommitment: string }
  r.post("/withdraw", async (req, res, next) => {
    try {
      const { spendCommitment } = req.body ?? {};
      if (!spendCommitment) return res.status(400).json({ error: "missing spendCommitment" });

      const path = await tree.getPathByCommitment(toBig(spendCommitment));
      const root = await tree.getRoot();

      res.json({
        merkleRoot: root.toString("hex"),
        pathElements: path.pathElements.map((b) => b.toString("hex")),
        pathIndices: path.pathIndices,
      });
    } catch (e) { next(e); }
  });

  return r;
}

// also export default, so either `import { prepareRouter }` or `import prepareRouter` works
export default prepareRouter;
