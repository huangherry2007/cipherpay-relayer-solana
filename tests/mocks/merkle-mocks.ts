// tests/mocks/merkle-mocks.ts
import { jest } from '@jest/globals';

export const mockMerkleStore = {
  getRoot: jest.fn(),
  setRoot: jest.fn(),
  getNextIndex: jest.fn(),
  setNextIndex: jest.fn(),
  getDepth: jest.fn(),
  getLeaf: jest.fn(),
  putLeaf: jest.fn(),
  appendAndRecompute: jest.fn(),
  getProofByIndex: jest.fn(),
  getMeta: jest.fn(),
  setMeta: jest.fn(),
  getLeafCount: jest.fn(),
  findLeafIndex: jest.fn(),
  putNode: jest.fn(),
  getNode: jest.fn(),
};

export const mockCanonicalTree = {
  getRoot: jest.fn(),
  append: jest.fn(),
  getProof: jest.fn(),
  getNextIndex: jest.fn(),
  getProofByIndex: jest.fn(),
  create: jest.fn(),
};

// Mock tree responses
export const mockTreeResponses = {
  root: Buffer.from('mock-root-32-bytes-long-123456789012', 'utf8'),
  nextIndex: 5,
  proof: {
    path: [Buffer.from('path1'), Buffer.from('path2')],
    indices: [0, 1],
  },
  appendResult: {
    index: 5,
    root: Buffer.from('new-root-32-bytes-long-123456789012', 'utf8'),
  },
};
