declare module 'snarkjs' {
  export namespace groth16 {
    interface Proof {
      pi_a: [string, string];
      pi_b: [[string, string], [string, string]];
      pi_c: [string, string];
    }

    interface VerificationKey {
      protocol: string;
      curve: string;
      nPublic: number;
      vk_alpha_1: [string, string];
      vk_beta_2: [[string, string], [string, string]];
      vk_gamma_2: [[string, string], [string, string]];
      vk_delta_2: [[string, string], [string, string]];
      vk_alphabeta_12: [[[string, string], [string, string]], [[string, string], [string, string]]];
      IC: [string, string][];
    }

    function verify(
      verificationKey: VerificationKey,
      publicSignals: string[],
      proof: Proof
    ): Promise<boolean>;

    function prove(
      provingKey: any,
      publicSignals: string[],
      privateSignals: string[]
    ): Promise<Proof>;

    function exportSolidityCallData(
      proof: Proof,
      publicSignals: string[]
    ): string;
  }

  export namespace plonk {
    interface Proof {
      A: [string, string];
      B: [string, string];
      C: [string, string];
      Z: [string, string];
      T1: [string, string];
      T2: [string, string];
      T3: [string, string];
      eval_a: string;
      eval_b: string;
      eval_c: string;
      eval_s1: string;
      eval_s2: string;
      eval_zw: string;
      eval_r: string;
      Wxi: [string, string];
      Wxiw: [string, string];
    }

    function verify(
      verificationKey: any,
      publicSignals: string[],
      proof: Proof
    ): Promise<boolean>;
  }

  export namespace powersOfTau {
    function newAccumulator(
      curve: string,
      power: number,
      filename: string
    ): Promise<void>;

    function contribute(
      oldFilename: string,
      newFilename: string,
      name: string,
      entropy: string
    ): Promise<void>;

    function exportChallenge(
      oldFilename: string,
      challengeFilename: string
    ): Promise<void>;

    function importResponse(
      oldFilename: string,
      responseFilename: string,
      newFilename: string,
      name: string
    ): Promise<void>;

    function verify(
      filename: string
    ): Promise<boolean>;

    function beacon(
      oldFilename: string,
      newFilename: string,
      name: string,
      numIterationsExp: number,
      beaconHash: string
    ): Promise<void>;

    function preparePhase2(
      oldFilename: string,
      newFilename: string
    ): Promise<void>;
  }

  export namespace zKey {
    function newZKey(
      r1csFilename: string,
      ptauFilename: string,
      zKeyFilename: string,
      verbose: boolean
    ): Promise<void>;

    function contribute(
      oldZKeyFilename: string,
      newZKeyFilename: string,
      name: string,
      entropy: string,
      verbose: boolean
    ): Promise<void>;

    function exportVerificationKey(
      zKeyFilename: string,
      verificationKeyFilename: string
    ): Promise<void>;

    function verifyFromR1cs(
      r1csFilename: string,
      ptauFilename: string,
      zKeyFilename: string
    ): Promise<boolean>;

    function verifyFromInit(
      initFilename: string,
      ptauFilename: string,
      zKeyFilename: string
    ): Promise<boolean>;
  }

  export namespace wtns {
    function calculate(
      inputFilename: string,
      outputFilename: string,
      verbose: boolean
    ): Promise<void>;

    function debug(
      inputFilename: string,
      outputFilename: string,
      assignmentFilename: string,
      verbose: boolean
    ): Promise<void>;

    function exportJson(
      inputFilename: string,
      outputFilename: string
    ): Promise<void>;
  }

  export namespace r1cs {
    function info(
      filename: string
    ): Promise<void>;

    function print(
      filename: string,
      outputFilename: string,
      sym: boolean
    ): Promise<void>;

    function exportJson(
      filename: string,
      outputFilename: string
    ): Promise<void>;
  }

  export namespace plonk {
    function setup(
      r1csFilename: string,
      ptauFilename: string,
      zKeyFilename: string
    ): Promise<void>;

    function verify(
      verificationKeyFilename: string,
      publicSignalsFilename: string,
      proofFilename: string
    ): Promise<boolean>;
  }
} 