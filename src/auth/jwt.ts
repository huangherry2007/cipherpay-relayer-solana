import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, importSPKI } from "jose";
import { loadEnv } from "@/services/config/env.js";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let publicKey: any | null = null;

export function jwtAuth() {
  const env = loadEnv();
  const { issuer, audience, jwksUrl, publicPem } = env.jwt;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return res.status(401).json({ error: "missing_bearer_token" });

      if (jwksUrl && !jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));
      if (publicPem && !publicKey) publicKey = await importSPKI(publicPem, "RS256");

      const verifyKey = jwks ?? publicKey;
      const { payload } = await jwtVerify(token, verifyKey, {
        issuer: issuer || undefined,
        audience: audience || undefined,
      });

      req.user = payload as any;
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}
