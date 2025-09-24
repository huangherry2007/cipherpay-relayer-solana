// tests/solana/event-watcher.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventWatcher } from '@/solana/event-watcher.js';
import { mockSolanaProgram } from '../mocks/solana-mocks.js';

// Mock the SolanaProgram
jest.mock('@/solana/program.js', () => ({
  SolanaProgram: jest.fn().mockImplementation(() => mockSolanaProgram),
}));

describe('EventWatcher', () => {
  let eventWatcher: EventWatcher;

  beforeEach(() => {
    eventWatcher = new EventWatcher(mockSolanaProgram as any);
    jest.clearAllMocks();
  });

  describe('onAll', () => {
    it('should register event listeners for all event types', () => {
      const mockCallback = jest.fn();
      
      eventWatcher.onAll(mockCallback);

      expect(mockSolanaProgram.program.addEventListener).toHaveBeenCalledWith(
        'depositCompleted',
        expect.any(Function)
      );
      expect(mockSolanaProgram.program.addEventListener).toHaveBeenCalledWith(
        'transferCompleted',
        expect.any(Function)
      );
      expect(mockSolanaProgram.program.addEventListener).toHaveBeenCalledWith(
        'withdrawCompleted',
        expect.any(Function)
      );
    });

    it('should call callback with deposit event data', () => {
      const mockCallback = jest.fn();
      eventWatcher.onAll(mockCallback);

      // Get the deposit event listener
      const depositListener = mockSolanaProgram.program.addEventListener.mock.calls
        .find(call => call[0] === 'depositCompleted')[1];

      const mockEventData = {
        depositHash: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        ownerCipherpayPubkey: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64],
        commitment: [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96],
        oldMerkleRoot: [97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128],
        newMerkleRoot: [129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160],
        nextLeafIndex: 5,
        mint: { toString: () => 'mint-address-123' }
      };

      depositListener(mockEventData);

      expect(mockCallback).toHaveBeenCalledWith({
        kind: 'deposit',
        data: {
          depositHash: Buffer.from(mockEventData.depositHash),
          ownerCipherpayPubkey: Buffer.from(mockEventData.ownerCipherpayPubkey),
          commitment: Buffer.from(mockEventData.commitment),
          oldMerkleRoot: Buffer.from(mockEventData.oldMerkleRoot),
          newMerkleRoot: Buffer.from(mockEventData.newMerkleRoot),
          nextLeafIndex: mockEventData.nextLeafIndex,
          mint: mockEventData.mint.toString(),
        }
      });
    });

    it('should call callback with transfer event data', () => {
      const mockCallback = jest.fn();
      eventWatcher.onAll(mockCallback);

      // Get the transfer event listener
      const transferListener = mockSolanaProgram.program.addEventListener.mock.calls
        .find(call => call[0] === 'transferCompleted')[1];

      const mockEventData = {
        nullifier: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        out1Commitment: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64],
        out2Commitment: [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96],
        encNote1Hash: [97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128],
        encNote2Hash: [129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160],
        merkleRootBefore: [161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192],
        newMerkleRoot1: [193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224],
        newMerkleRoot2: [225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 0],
        nextLeafIndex: 10,
        mint: { toString: () => 'mint-address-456' }
      };

      transferListener(mockEventData);

      expect(mockCallback).toHaveBeenCalledWith({
        kind: 'transfer',
        data: {
          nullifier: Buffer.from(mockEventData.nullifier),
          out1Commitment: Buffer.from(mockEventData.out1Commitment),
          out2Commitment: Buffer.from(mockEventData.out2Commitment),
          encNote1Hash: Buffer.from(mockEventData.encNote1Hash),
          encNote2Hash: Buffer.from(mockEventData.encNote2Hash),
          merkleRootBefore: Buffer.from(mockEventData.merkleRootBefore),
          newMerkleRoot1: Buffer.from(mockEventData.newMerkleRoot1),
          newMerkleRoot2: Buffer.from(mockEventData.newMerkleRoot2),
          nextLeafIndex: mockEventData.nextLeafIndex,
          mint: mockEventData.mint.toString(),
        }
      });
    });

    it('should call callback with withdraw event data', () => {
      const mockCallback = jest.fn();
      eventWatcher.onAll(mockCallback);

      // Get the withdraw event listener
      const withdrawListener = mockSolanaProgram.program.addEventListener.mock.calls
        .find(call => call[0] === 'withdrawCompleted')[1];

      const mockEventData = {
        nullifier: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
        recipient: { toString: () => 'recipient-address-789' },
        amount: '1000000000',
        mint: { toString: () => 'mint-address-789' }
      };

      withdrawListener(mockEventData);

      expect(mockCallback).toHaveBeenCalledWith({
        kind: 'withdraw',
        data: {
          nullifier: Buffer.from(mockEventData.nullifier),
          recipient: mockEventData.recipient.toString(),
          amount: BigInt(mockEventData.amount),
          mint: mockEventData.mint.toString(),
        }
      });
    });
  });

  describe('stop', () => {
    it('should stop watching events and clear listeners', () => {
      const mockCallback = jest.fn();
      eventWatcher.onAll(mockCallback);
      
      eventWatcher.stop();

      // Verify that the internal state is reset
      expect(eventWatcher['isWatching']).toBe(false);
      expect(eventWatcher['listeners']).toEqual([]);
    });
  });

  describe('getRecentEvents', () => {
    it('should return empty array for recent events', async () => {
      const events = await eventWatcher.getRecentEvents();
      expect(events).toEqual([]);
    });
  });
});
