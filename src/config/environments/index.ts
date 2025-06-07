import { EnvironmentConfig } from './types';
import { mainnetConfig } from './mainnet';
import { devnetConfig } from './devnet';
import { testnetConfig } from './testnet';
import { localConfig } from './local';

export type Environment = 'mainnet' | 'devnet' | 'testnet' | 'local';

const environments: Record<Environment, EnvironmentConfig> = {
  mainnet: mainnetConfig,
  devnet: devnetConfig,
  testnet: testnetConfig,
  local: localConfig,
};

export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private currentEnvironment: Environment = 'local';

  private constructor() {}

  static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  getCurrentEnvironment(): Environment {
    return this.currentEnvironment;
  }

  getConfig(): EnvironmentConfig {
    return environments[this.currentEnvironment];
  }

  setEnvironment(env: Environment): void {
    if (!environments[env]) {
      throw new Error(`Invalid environment: ${env}`);
    }
    this.currentEnvironment = env;
  }

  getEnvironmentConfig(env: Environment): EnvironmentConfig {
    if (!environments[env]) {
      throw new Error(`Invalid environment: ${env}`);
    }
    return environments[env];
  }
}

// Export a singleton instance
export const environmentManager = EnvironmentManager.getInstance(); 