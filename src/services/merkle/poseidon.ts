// src/services/merkle/poseidon.ts
import { bigIntToLe32, le32ToBigInt } from "@/utils/bytes.js";

let _poseidon: any;
let _F: any;

export async function buildPoseidon() {
  if (_poseidon) return { poseidon: _poseidon, F: _F };
  const { buildPoseidon } = await import("circomlibjs");
  _poseidon = await buildPoseidon();
  _F = _poseidon.F;
  return { poseidon: _poseidon, F: _F };
}

export async function H(...xs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await buildPoseidon();
  return F.toObject(poseidon(xs)) as bigint;
}
export async function H2(a: bigint, b: bigint): Promise<bigint> {
  return H(a, b);
}

const _zerosCache = new Map<number, bigint[]>();

export async function zeros(depth: number): Promise<bigint[]> {
  if (_zerosCache.has(depth)) return _zerosCache.get(depth)!;
  const { poseidon, F } = await buildPoseidon();
  const H_ = (...xs: bigint[]) => F.toObject(poseidon(xs)) as bigint;
  const z: bigint[] = [0n];
  for (let i = 1; i <= depth; i++) z[i] = H_(z[i - 1], z[i - 1]);
  _zerosCache.set(depth, z);
  return z;
}

/** recompute root (utility) */
export async function computeRootFromProof(
  leaf: Buffer,
  pathElements: Buffer[],
  pathIndices: number[],
): Promise<Buffer> {
  const { poseidon, F } = await buildPoseidon();
  let cur = le32ToBigInt(leaf);
  for (let i = 0; i < pathElements.length; i++) {
    const sib = le32ToBigInt(pathElements[i]);
    cur = pathIndices[i] === 0 ? F.toObject(poseidon([cur, sib])) : F.toObject(poseidon([sib, cur]));
  }
  return bigIntToLe32(cur);
}
