// src/utils/bytes.ts
export function bigIntToLe32(x: bigint): Buffer {
  const out = Buffer.alloc(32);
  let v = x;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}
export function le32ToBigInt(b: Buffer): bigint {
  let x = 0n;
  for (let i = 31; i >= 0; i--) x = (x << 8n) + BigInt(b[i] ?? 0);
  return x;
}
export const feHex = (b: Buffer) => b.toString("hex");
export const toBig = (x: string | number | bigint) =>
  typeof x === "bigint" ? x : typeof x === "number" ? BigInt(x) : BigInt(x);
