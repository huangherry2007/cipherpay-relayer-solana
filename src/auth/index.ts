import { jwtAuth } from "./jwt.js";
import { hmacAuth } from "./hmac.js";
import { loadEnv } from "@/services/config/env.js";

export function makeAuthMiddleware() {
  const { authMode } = loadEnv();
  return authMode === "hmac" ? hmacAuth() : jwtAuth();
}
