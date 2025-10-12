// src/auth/index.ts
import { RequestHandler } from "express";
import { loadEnv } from "@/services/config/env.js";
import { jwtAuth } from "./jwt.js";
import { bearerAuth } from "./bearer.js";

export function makeAuthMiddleware(): RequestHandler {
  const env = loadEnv();

  if (env.disableApiAuth || process.env.DISABLE_API_AUTH === "1") {
    return (_req, _res, next) => next(); // no auth (dev)
  }

  // Prefer JWT if any JWT configuration is present
  const hasJwt =
    !!(env.jwt?.jwksUrl || env.jwt?.publicPem || env.jwt?.hs256Secret ||
       process.env.JWT_JWKS_URL || process.env.JWT_PUBLIC_PEM || process.env.JWT_HS256_SECRET);

  if (hasJwt) return jwtAuth();

  // Else fall back to static bearer token
  if (env.apiToken || process.env.API_TOKEN) return bearerAuth();

  // Misconfigured
  return (_req, res) => res.status(401).json({ error: "auth_not_configured" });
}
