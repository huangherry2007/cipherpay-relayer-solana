import crypto from "crypto";
import fetch, { RequestInit } from "node-fetch";

// -------- JWT helper --------
export async function callWithJwt(
  url: string,
  token: string,
  opts: RequestInit = {}
) {
  const headers = {
    ...(opts.headers || {}),
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    throw new Error(`JWT call failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// -------- HMAC helper --------
export async function callWithHmac(
  url: string,
  keyId: string,
  secret: string,
  method: string,
  bodyObj: any = null
) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = [method.toUpperCase(), new URL(url).pathname, ts, bodyHash].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");

  const headers = {
    "Content-Type": "application/json",
    "X-CipherPay-Key": keyId,
    "X-CipherPay-Timestamp": ts,
    "X-CipherPay-Signature": sig,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  });
  if (!res.ok) {
    throw new Error(`HMAC call failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
