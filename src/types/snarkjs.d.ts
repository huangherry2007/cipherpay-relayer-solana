declare module 'snarkjs' {
  export interface Groth16Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: string;
    curve: string;
  }

  export interface PublicSignals {
    [key: string]: string;
  }

  export interface VerificationKey {
    protocol: string;
    curve: string;
    nPublic: number;
    vk_alpha_1: [string, string, string];
    vk_beta_2: [[string, string], [string, string], [string, string]];
    vk_gamma_2: [[string, string], [string, string], [string, string]];
    vk_delta_2: [[string, string], [string, string], [string, string]];
    vk_alphabeta_12: any[];
    IC: [string, string, string][];
  }

  export const groth16: {
    verify(vkey: VerificationKey, publicSignals: string[], proof: Groth16Proof): Promise<boolean>;
    setup(circuit: any): Promise<{ provingKey: any; verificationKey: VerificationKey }>;
    prove(provingKey: any, witness: any): Promise<Groth16Proof>;
    exportSolidityCallData(proof: Groth16Proof, publicSignals: string[]): string;
  };

  export const plonk: {
    verify(vkey: VerificationKey, publicSignals: string[], proof: Groth16Proof): Promise<boolean>;
    setup(circuit: any): Promise<{ provingKey: any; verificationKey: VerificationKey }>;
    prove(provingKey: any, witness: any): Promise<Groth16Proof>;
  };

  export const wtns: {
    calculate(input: any, witness: any): Promise<any>;
  };

  export const zKey: {
    newZKey(r1cs: any, ptau: any, zkey: any): Promise<any>;
    verifyFromR1cs(r1cs: any, verificationKey: VerificationKey): Promise<boolean>;
  };
}
