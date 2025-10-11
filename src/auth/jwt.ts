// src/auth/jwt.ts
import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, importSPKI } from "jose";
import { loadEnv } from "@/services/config/env.js";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let publicKey: any | null = null;

export function jwtAuth() {
  const env = loadEnv();
  const { issuer, audience, jwksUrl, publicPem, hs256Secret } = env.jwt || ({} as any);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return res.status(401).json({ error: "missing_bearer_token" });

      let key: any = null;

      if (jwksUrl) {
        if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));
        key = jwks;
      } else if (publicPem) {
        if (!publicKey) publicKey = await importSPKI(publicPem, "RS256");
        key = publicKey;
      } else if (hs256Secret) {
        // HS256 shared secret
        key = new TextEncoder().encode(hs256Secret);
      } else {
        // Nothing configured for JWT
        return res.status(401).json({ error: "jwt_not_configured" });
      }

      const { payload } = await jwtVerify(token, key, {
        issuer: issuer || undefined,
        audience: audience || undefined,
      });

      (req as any).user = payload;
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}
