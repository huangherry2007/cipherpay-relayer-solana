// src/utils/bytes.ts
/** Parse a 32-byte little-endian buffer to bigint */
export function le32ToBigInt(buf: Buffer | Uint8Array): bigint {
  let x = 0n;
  const b = Buffer.from(buf);
  for (let i = b.length - 1; i >= 0; i--) {
    x = (x << 8n) | BigInt(b[i]);
  }
  return x;
}

/** Parse a 32-byte big-endian buffer to bigint */
export function be32ToBigInt(buf: Buffer | Uint8Array): bigint {
  let x = 0n;
  const b = Buffer.from(buf);
  for (let i = 0; i < b.length; i++) {
    x = (x << 8n) | BigInt(b[i]);
  }
  return x;
}

/** Encode bigint to 32-byte little-endian buffer */
export function bigIntToLe32(x0: bigint): Buffer {
  let x = x0;
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Encode bigint to 32-byte big-endian buffer */
export function bigIntToBe32(x0: bigint): Buffer {
  let x = x0;
  const out = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
export const feHex = (b: Buffer) => b.toString("hex");
export const toBig = (x: string | number | bigint) =>
  typeof x === "bigint" ? x : typeof x === "number" ? BigInt(x) : BigInt(x);
