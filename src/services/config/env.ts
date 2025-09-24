// src/services/config/env.ts
export function loadEnv() {
  return {
    port: Number(process.env.RELAYER_PORT ?? 3000),
    vkeyDir: process.env.VKEY_DIR ?? "./vkeys",
    mysql: {
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? "cipherpay",
      password: process.env.MYSQL_PASSWORD ?? "cipherpay",
      database: process.env.MYSQL_DB ?? "cipherpay",
    },
    rpcUrl: process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
    solanaRpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    programId: process.env.PROGRAM_ID ?? "",
    authMode: (process.env.AUTH_MODE ?? "jwt") as "jwt" | "hmac",
    jwt: {
      issuer: process.env.AUTH_JWT_ISSUER ?? "",
      audience: process.env.AUTH_JWT_AUDIENCE ?? "",
      jwksUrl: process.env.AUTH_JWKS_URL ?? "",
      publicPem: process.env.AUTH_JWT_PUBLIC_PEM ?? "",
    },
    hmac: {
      keyId: process.env.AUTH_HMAC_KEY_ID ?? "",
      secret: process.env.AUTH_HMAC_SECRET ?? "",
      skewSeconds: Number(process.env.AUTH_HMAC_SKEW_SECONDS ?? 300),
    },
  };
}
