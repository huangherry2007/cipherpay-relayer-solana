import { Connection, Transaction } from '@solana/web3.js';
import { ShieldedTransaction, GasEstimate } from '../config/types';
import { DEFAULT_CONFIG } from '../config/constants';

export class GasService {
  private connection: Connection;
  private config: typeof DEFAULT_CONFIG;

  constructor(connection: Connection, config: typeof DEFAULT_CONFIG = DEFAULT_CONFIG) {
    this.connection = connection;
    this.config = config;
  }

  async estimateGas(transaction: ShieldedTransaction): Promise<GasEstimate> {
    // Get current fee from the network
    const fee = await this.getCurrentFee();

    // Estimate compute units based on transaction complexity
    const estimatedComputeUnits = this.calculateComputeUnits(transaction);

    return {
      estimatedGas: estimatedComputeUnits,
      gasPrice: fee,
      totalCost: estimatedComputeUnits * fee
    };
  }

  canCoverGas(estimate: GasEstimate): boolean {
    return estimate.totalCost <= this.config.maxGasPrice &&
           estimate.totalCost >= this.config.minGasPrice;
  }

  private async getCurrentFee(): Promise<number> {
    try {
      // Get the current slot
      const slot = await this.connection.getSlot();
      
      // Get the fee calculator for the current slot
      const feeCalculator = await this.connection.getFeeCalculatorForBlockhash(
        (await this.connection.getRecentBlockhash()).blockhash
      );

      // Return the fee per signature
      return feeCalculator.value.lamportsPerSignature;
    } catch (error) {
      throw new Error(`Failed to get current fee: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateComputeUnits(transaction: ShieldedTransaction): number {
    // Base compute units for a standard transaction
    let computeUnits = 200000;

    // Add compute units for zk-proof verification
    // This is a significant operation in Solana
    computeUnits += 400000;

    // Add compute units for commitment and nullifier operations
    computeUnits += 150000;

    // Add compute units for encrypted note handling
    computeUnits += 100000;

    // Add compute units for merkle tree operations
    computeUnits += 200000;

    return computeUnits;
  }

  async validateTransaction(transaction: Transaction): Promise<boolean> {
    try {
      // Simulate the transaction to get compute units
      const simulation = await this.connection.simulateTransaction(transaction);
      
      if (simulation.value.err) {
        return false;
      }

      // Check if compute units are within limits
      const computeUnits = simulation.value.unitsConsumed || 0;
      return computeUnits <= this.config.maxGasPrice;
    } catch (error) {
      throw new Error(`Failed to validate transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
