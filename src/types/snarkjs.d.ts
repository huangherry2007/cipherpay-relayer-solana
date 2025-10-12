declare module 'snarkjs' {
  export interface Groth16Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string]];
    pi_c: [string, string, string];
  }

  export interface Groth16 {
    verify(vkey: any, signals: string[], proof: Groth16Proof): Promise<boolean>;
    fullProve(inputs: any, wasmPath: string, zkeyPath: string): Promise<{
      proof: Groth16Proof;
      publicSignals: string[];
    }>;
  }

  export const groth16: Groth16;
}
