import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { loadEnv } from "@/services/config/env.js";

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

export function hmacAuth() {
  const { hmac } = loadEnv();
  return async (req: Request, res: Response, next: NextFunction) => {
    const kid = req.headers["x-cipherpay-key"] as string;
    const ts = req.headers["x-cipherpay-timestamp"] as string;
    const sig = req.headers["x-cipherpay-signature"] as string;
    if (!kid || !ts || !sig) return res.status(401).json({ error: "missing_hmac_headers" });
    if (kid !== hmac.keyId) return res.status(401).json({ error: "bad_key_id" });

    const now = Math.floor(Date.now() / 1000);
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > hmac.skewSeconds)
      return res.status(401).json({ error: "timestamp_out_of_window" });

    const bodyRaw = (req as any).rawBody ?? "";
    const bodyHash = crypto.createHash("sha256").update(bodyRaw).digest("hex");
    const canonical = [req.method.toUpperCase(), req.path, ts, bodyHash].join("\n");
    const expected = crypto.createHmac("sha256", hmac.secret).update(canonical).digest("hex");

    if (!safeEqual(sig, expected)) return res.status(401).json({ error: "bad_signature" });

    req.user = { sub: kid, scope: "sdk" };
    next();
  };
}
