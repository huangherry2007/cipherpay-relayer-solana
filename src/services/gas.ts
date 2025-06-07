import { Connection } from '@solana/web3.js';
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
    // Get current gas price from the network
    const gasPrice = await this.getCurrentGasPrice();

    // Estimate gas units based on transaction complexity
    const estimatedGas = this.calculateGasUnits(transaction);

    return {
      estimatedGas,
      gasPrice,
      totalCost: estimatedGas * gasPrice
    };
  }

  canCoverGas(estimate: GasEstimate): boolean {
    return estimate.totalCost <= this.config.maxGasPrice &&
           estimate.totalCost >= this.config.minGasPrice;
  }

  private async getCurrentGasPrice(): Promise<number> {
    try {
      // In Solana, we use a fixed gas price for now
      // This could be enhanced to use a dynamic pricing model
      return 5000; // 0.000005 SOL per unit
    } catch (error) {
      throw new Error('Failed to get current gas price');
    }
  }

  private calculateGasUnits(transaction: ShieldedTransaction): number {
    // Base gas cost
    let gasUnits = 21000;

    // Add gas for zk-proof verification
    gasUnits += 100000;

    // Add gas for commitment and nullifier operations
    gasUnits += 50000;

    // Add gas for encrypted note handling
    gasUnits += 30000;

    return gasUnits;
  }
}
