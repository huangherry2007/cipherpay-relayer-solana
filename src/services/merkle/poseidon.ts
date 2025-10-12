// src/services/merkle/poseidon.ts
import { bigIntToLe32, le32ToBigInt } from "@/utils/bytes.js";

let _poseidon: ((xs: bigint[]) => any) | null = null;
let _F: any | null = null;

/**
 * Load circomlibjs poseidon in a way that works for both CJS and ESM builds.
 * Prefer buildPoseidon() when available; otherwise fall back to poseidon export.
 */
async function loadCircomPoseidon(): Promise<{ poseidon: (xs: bigint[]) => any; F: any }> {
  if (_poseidon && _F) return { poseidon: _poseidon!, F: _F! };

  const mod: any = await import("circomlibjs");

  // Try to find buildPoseidon from any of the usual places
  const buildPoseidon =
    mod.buildPoseidon ||
    mod.default?.buildPoseidon ||
    mod?.wasm?.buildPoseidon; // very defensive, just in case

  if (typeof buildPoseidon === "function") {
    const p = await buildPoseidon();
    _poseidon = (xs: bigint[]) => p(xs); // p is the poseidon function
    _F = p.F;
  } else {
    // Fall back to direct poseidon export (CJS style)
    const p = mod.poseidon || mod.default?.poseidon;
    if (!p) {
      throw new Error(
        "circomlibjs: neither buildPoseidon() nor poseidon export found. Please ensure circomlibjs is installed correctly."
      );
    }
    _poseidon = (xs: bigint[]) => p(xs);
    _F = p.F;
  }

  if (!_F || typeof _F.toObject !== "function") {
    throw new Error("circomlibjs: Poseidon field 'F' is missing or invalid.");
  }

  return { poseidon: _poseidon!, F: _F! };
}

export async function H(...xs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await loadCircomPoseidon();
  return F.toObject(poseidon(xs)) as bigint;
}

export async function H2(a: bigint, b: bigint): Promise<bigint> {
  return H(a, b);
}

const _zerosCache = new Map<number, bigint[]>();

export async function zeros(depth: number): Promise<bigint[]> {
  if (_zerosCache.has(depth)) return _zerosCache.get(depth)!;

  const { poseidon, F } = await loadCircomPoseidon();
  const H_ = (...xs: bigint[]) => F.toObject(poseidon(xs)) as bigint;

  const z: bigint[] = [0n]; // zero leaf
  for (let i = 1; i <= depth; i++) z[i] = H_(z[i - 1], z[i - 1]);
  _zerosCache.set(depth, z);
  return z;
}

/** Recompute root from a single Merkle path (LE-encoded 32B buffers). */
export async function computeRootFromProof(
  leaf: Buffer,
  pathElements: Buffer[],
  pathIndices: number[],
): Promise<Buffer> {
  const { poseidon, F } = await loadCircomPoseidon();
  let cur = le32ToBigInt(leaf);
  for (let i = 0; i < pathElements.length; i++) {
    const sib = le32ToBigInt(pathElements[i]);
    cur =
      pathIndices[i] === 0
        ? (F.toObject(poseidon([cur, sib])) as bigint)
        : (F.toObject(poseidon([sib, cur])) as bigint);
  }
  return bigIntToLe32(cur);
}
