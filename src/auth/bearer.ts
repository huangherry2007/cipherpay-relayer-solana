// src/auth/bearer.ts
import { NextFunction, Request, Response } from "express";
import { loadEnv } from "@/services/config/env.js";

export function bearerAuth() {
  const env = loadEnv();
  const token = env.apiToken || process.env.API_TOKEN; // allow both

  if (!token) {
    // misconfig—no token available
    return (_req: Request, res: Response, _next: NextFunction) =>
      res.status(401).json({ error: "auth_not_configured" });
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!provided) return res.status(401).json({ error: "missing_bearer_token" });
    if (provided !== token) return res.status(401).json({ error: "invalid_token" });

    // minimal user context
    (req as any).user = { sub: "opaque", method: "bearer" };
    next();
  };
}
