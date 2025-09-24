// src/types/external.d.ts
import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      sub?: string;
      email?: string;
      scope?: string | string[];
      [k: string]: any;
    };
  }
}

declare module "circomlibjs" {
  export function buildPoseidon(): Promise<any>;
}

declare module "snarkjs" {
  const snarkjs: any;
  export default snarkjs;
}
