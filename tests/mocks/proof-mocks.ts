// tests/mocks/proof-mocks.ts
import { jest } from '@jest/globals';

export const mockProofVerifier = {
  verify: jest.fn(),
  load: jest.fn(),
};

export const mockProofs = {
  deposit: {
    proof: {
      pi_a: ['123', '456', '1'],
      pi_b: [['789', '012'], ['345', '678'], ['1', '0']],
      pi_c: ['901', '234', '1'],
    },
    publicSignals: ['100', '200', '300'],
  },
  transfer: {
    proof: {
      pi_a: ['111', '222', '1'],
      pi_b: [['333', '444'], ['555', '666'], ['1', '0']],
      pi_c: ['777', '888', '1'],
    },
    publicSignals: ['400', '500', '600'],
  },
  withdraw: {
    proof: {
      pi_a: ['999', '000', '1'],
      pi_b: [['111', '222'], ['333', '444'], ['1', '0']],
      pi_c: ['555', '666', '1'],
    },
    publicSignals: ['700', '800', '900'],
  },
};

export const mockVKeys = {
  deposit: {
    protocol: 'groth16',
    curve: 'bn128',
    nPublic: 3,
    vk_alpha_1: ['1', '2'],
    vk_beta_2: [['3', '4'], ['5', '6']],
    vk_gamma_2: [['7', '8'], ['9', '10']],
    vk_delta_2: [['11', '12'], ['13', '14']],
    vk_alphabeta_12: [['15', '16'], ['17', '18']],
    IC: [['19', '20'], ['21', '22'], ['23', '24']],
  },
};
