// src/server/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { isDashboardAuthEnabled, getDashboardToken } from "@/services/config/env.js";
import { logger } from "@/utils/logger.js";

export function protectDashboard(req: Request, res: Response, next: NextFunction) {
  if (!isDashboardAuthEnabled()) {
    // no-op if disabled (local/dev)
    return next();
  }

  const token = getDashboardToken();
  if (!token) {
    // Auth is enabled but no token configured -> deny with explicit error
    return res.status(503).json({ error: "dashboard_auth_enabled_but_token_missing" });
  }

  const header = req.headers.authorization || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented !== token) {
    logger.app.warn({ route: req.originalUrl }, "Dashboard auth failed");
    return res.status(401).json({ error: "missing_or_invalid_bearer_token" });
  }

  return next();
}
