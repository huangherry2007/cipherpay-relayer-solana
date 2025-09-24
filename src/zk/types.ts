// src/zk/types.ts
export interface ZKProof {
    a: [string, string];
    b: [[string, string], [string, string]];
    c: [string, string];
    publicSignals?: string[];
  }
  