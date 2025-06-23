import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ShieldedTransaction, RelayerResponse, TransactionMetadata } from '../config/types';
import { ProofVerifierFactory, ZKProof } from './proof';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../config/constants';
import { validateTransaction } from '../utils/validation';
import { encryptTransaction } from '../utils/crypto';

export interface TransactionRequest {
  shieldedTx: ShieldedTransaction;
  circuitType: 'transfer' | 'merkle' | 'nullifier' | 'stream' | 'split' | 'condition' | 'audit' | 'withdraw';
  proof: ZKProof;
  fee?: number;
  priority?: 'low' | 'medium' | 'high';
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  metadata?: TransactionMetadata;
}

export class TransactionManager {
  private connection: Connection;
  private keypair: Keypair;
  private programId: PublicKey;

  constructor(connection: Connection, keypair: Keypair, programId: PublicKey) {
    this.connection = connection;
    this.keypair = keypair;
    this.programId = programId;
  }

  async processTransaction(request: TransactionRequest): Promise<TransactionResult> {
    try {
      // Step 1: Validate the shielded transaction
      if (!validateTransaction(request.shieldedTx)) {
        return {
          success: false,
          error: ERROR_MESSAGES.INVALID_PROOF
        };
      }

      // Step 2: Verify the zero-knowledge proof
      const proofValid = await ProofVerifierFactory.verifyProof(
        request.circuitType,
        request.proof
      );

      if (!proofValid) {
        return {
          success: false,
          error: ERROR_MESSAGES.INVALID_PROOF
        };
      }

      // Step 3: Create the Solana transaction
      const transaction = await this.createSolanaTransaction(request);

      // Step 4: Sign and submit the transaction
      const txHash = await this.submitTransaction(transaction);

      // Step 5: Monitor transaction status
      const metadata = await this.monitorTransaction(txHash);

      return {
        success: true,
        txHash,
        metadata
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
      };
    }
  }

  private async createSolanaTransaction(request: TransactionRequest): Promise<Transaction> {
    const transaction = new Transaction();

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.keypair.publicKey;

    // Add the program instruction based on circuit type
    const instruction = this.createProgramInstruction(request);
    transaction.add(instruction);

    // Add fee payment if specified
    if (request.fee && request.fee > 0) {
      const feeInstruction = SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: this.programId,
        lamports: request.fee * LAMPORTS_PER_SOL
      });
      transaction.add(feeInstruction);
    }

    return transaction;
  }

  private createProgramInstruction(request: TransactionRequest) {
    const { shieldedTx, circuitType } = request;

    // Create the instruction data
    const instructionData = {
      circuitType,
      commitment: shieldedTx.commitment,
      nullifier: shieldedTx.nullifier,
      merkleRoot: shieldedTx.merkleRoot,
      encryptedNote: shieldedTx.encryptedNote,
      senderEphemeralPubKey: shieldedTx.senderEphemeralPubKey
    };

    // Convert to buffer
    const data = Buffer.from(JSON.stringify(instructionData));

    return {
      programId: this.programId,
      keys: [
        { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(shieldedTx.senderEphemeralPubKey), isSigner: false, isWritable: false },
        // Add other required account keys based on circuit type
      ],
      data
    };
  }

  private async submitTransaction(transaction: Transaction): Promise<string> {
    // Sign the transaction
    transaction.sign(this.keypair);

    // Submit the transaction
    const txHash = await this.connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      }
    );

    return txHash;
  }

  private async monitorTransaction(txHash: string): Promise<TransactionMetadata> {
    try {
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(txHash, 'confirmed');

      if (confirmation.value.err) {
        return {
          status: 'failed',
          timestamp: Date.now(),
          retryCount: 0,
          error: confirmation.value.err.toString()
        };
      }

      return {
        status: 'confirmed',
        timestamp: Date.now(),
        retryCount: 0
      };

    } catch (error) {
      return {
        status: 'failed',
        timestamp: Date.now(),
        retryCount: 0,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
      };
    }
  }

  async getTransactionStatus(txHash: string): Promise<TransactionMetadata> {
    try {
      const status = await this.connection.getSignatureStatus(txHash);
      
      if (!status.value) {
        return {
          status: 'pending',
          timestamp: Date.now(),
          retryCount: 0
        };
      }

      if (status.value.err) {
        return {
          status: 'failed',
          timestamp: Date.now(),
          retryCount: 0,
          error: status.value.err.toString()
        };
      }

      return {
        status: status.value.confirmationStatus as any,
        timestamp: Date.now(),
        retryCount: 0
      };

    } catch (error) {
      return {
        status: 'failed',
        timestamp: Date.now(),
        retryCount: 0,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR
      };
    }
  }

  async estimateTransactionFee(request: TransactionRequest): Promise<number> {
    try {
      // Estimate compute units based on circuit type
      const computeUnits = this.estimateComputeUnits(request.circuitType);
      
      // Get current fee rate
      const { feeCalculator } = await this.connection.getRecentBlockhash();
      const feeRate = feeCalculator ? feeCalculator.lamportsPerSignature : 5000;
      
      // Calculate total fee
      const totalFee = computeUnits * feeRate;
      
      return totalFee;
    } catch (error) {
      throw new Error(`Failed to estimate transaction fee: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async cancelTransaction(transactionId: string): Promise<{ status: string }> {
    try {
      // In Solana, we can't directly cancel a transaction once it's submitted
      // We can only check if it's still pending and hasn't been confirmed
      const status = await this.getTransactionStatus(transactionId);
      
      if (status.status === 'pending') {
        // Transaction is still pending, we can consider it "cancelled" for our purposes
        return { status: 'cancelled' };
      } else {
        // Transaction has already been processed
        return { status: status.status };
      }
    } catch (error) {
      throw new Error(`Failed to cancel transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async estimateFees(transactionData: any, circuitType: string): Promise<number> {
    try {
      // Create a mock request for fee estimation
      const mockRequest: TransactionRequest = {
        shieldedTx: transactionData,
        circuitType: circuitType as any,
        proof: {
          a: ['0x0', '0x0'],
          b: [['0x0', '0x0'], ['0x0', '0x0']],
          c: ['0x0', '0x0'],
          publicInputs: ['0x0', '0x0', '0x0', '0x0']
        }
      };
      
      return await this.estimateTransactionFee(mockRequest);
    } catch (error) {
      throw new Error(`Failed to estimate fees: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private estimateComputeUnits(circuitType: string): number {
    // Base compute units for a standard transaction
    let computeUnits = 200000;

    // Add compute units based on circuit type complexity
    switch (circuitType) {
      case 'transfer':
        computeUnits += 400000; // Standard transfer
        break;
      case 'merkle':
        computeUnits += 300000; // Merkle tree operations
        break;
      case 'nullifier':
        computeUnits += 250000; // Nullifier operations
        break;
      case 'stream':
        computeUnits += 500000; // Time-based operations
        break;
      case 'split':
        computeUnits += 600000; // Multi-output operations
        break;
      case 'condition':
        computeUnits += 450000; // Conditional operations
        break;
      case 'audit':
        computeUnits += 350000; // Audit operations
        break;
      case 'withdraw':
        computeUnits += 400000; // Withdrawal operations
        break;
      default:
        computeUnits += 400000; // Default
    }

    return computeUnits;
  }
}
