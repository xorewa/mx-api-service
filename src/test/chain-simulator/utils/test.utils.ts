import axios from 'axios';
import { config } from '../config/env.config';
import { DeployScArgs, sendTransaction, SendTransactionArgs } from './chain.simulator.operations';
import { fundAddress } from './chain.simulator.operations';
import { deploySc } from './chain.simulator.operations';
import fs from 'fs';
export class ChainSimulatorUtils {
  static async waitForApiFixtureReadiness(
    tokenIdentifiers: string[],
    metaEsdtCollectionIdentifiers: string[],
    expectedTransactionsPerMetaEsdtCollection: number,
    maxRetries: number = 120,
    retryIntervalMs: number = 2000,
  ): Promise<void> {
    let lastFailure = 'API fixture readiness has not been checked yet';

    for (let retry = 1; retry <= maxRetries; retry++) {
      try {
        const [tokensResponse, accountTokensResponse, ...metaEsdtTransactionsResponses] = await Promise.all([
          axios.get(`${config.apiServiceUrl}/tokens?size=10000`),
          axios.get(`${config.apiServiceUrl}/accounts/${config.aliceAddress}/tokens?size=10000`),
          ...metaEsdtCollectionIdentifiers.map(identifier =>
            axios.get(`${config.apiServiceUrl}/collections/${identifier}/transactions?size=10000`),
          ),
        ]);

        const indexedTokenIdentifiers = new Set(tokensResponse.data.map((token: { identifier: string }) => token.identifier));
        const aliceTokenIdentifiers = new Set(accountTokensResponse.data.map((token: { identifier: string }) => token.identifier));
        const missingIndexedTokens = tokenIdentifiers.filter(identifier => !indexedTokenIdentifiers.has(identifier));
        const missingAliceTokens = tokenIdentifiers.filter(identifier => !aliceTokenIdentifiers.has(identifier));
        const incompleteMetaEsdtCollections = metaEsdtTransactionsResponses
          .map((response, index) => ({
            identifier: metaEsdtCollectionIdentifiers[index],
            transactionCount: response.data.length,
          }))
          .filter(collection => collection.transactionCount < expectedTransactionsPerMetaEsdtCollection);

        if (missingIndexedTokens.length === 0 && missingAliceTokens.length === 0 && incompleteMetaEsdtCollections.length === 0) {
          return;
        }

        lastFailure = [
          missingIndexedTokens.length > 0 && `tokens not indexed: ${missingIndexedTokens.join(', ')}`,
          missingAliceTokens.length > 0 && `tokens not visible for Alice: ${missingAliceTokens.join(', ')}`,
          incompleteMetaEsdtCollections.length > 0 && `MetaESDT transactions incomplete: ${incompleteMetaEsdtCollections.map(collection => `${collection.identifier}=${collection.transactionCount}/${expectedTransactionsPerMetaEsdtCollection}`).join(', ')}`,
        ].filter(Boolean).join('; ');
      } catch (error: any) {
        lastFailure = error.message ?? String(error);
      }

      if (retry < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
      }
    }

    throw new Error(`Timed out waiting for chain-simulator fixtures to reach the API after ${maxRetries * retryIntervalMs / 1000} seconds: ${lastFailure}`);
  }

  static async waitForEpoch(targetEpoch: number = 2, maxRetries: number = 50) {
    try {
      // First check if simulator is running
      await this.checkSimulatorHealth(maxRetries);

      let retries = 0;
      while (retries < maxRetries) {
        try {
          const currentEpoch = await this.getSimulatorEpoch();

          if (currentEpoch >= targetEpoch) {
            return true;
          }

          await axios.post(
            `${config.chainSimulatorUrl}/simulator/generate-blocks-until-epoch-reached/${targetEpoch}`,
            {},
          );

          // Fixture preparation runs before the API service starts in CI. Verify
          // epoch advancement against the simulator itself, rather than its API
          // projection, so the helper has no hidden startup-order dependency.
          const newEpoch = await this.getSimulatorEpoch();

          if (newEpoch >= targetEpoch) {
            return true;
          }

          retries++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            throw new Error(`Failed to reach epoch ${targetEpoch} after ${maxRetries} retries`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      throw new Error(`Failed to reach epoch ${targetEpoch} after ${maxRetries} retries`);
    } catch (error) {
      console.error('Error in waitForEpoch:', error);
      throw error;
    }
  }

  private static async checkSimulatorHealth(maxRetries: number = 50): Promise<boolean> {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await axios.get(`${config.chainSimulatorUrl}/simulator/observers`);
        if (response.status === 200) {
          return true;
        }
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw new Error('Chain simulator not started or not responding!');
        }
        // Wait for 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return false;
  }

  private static async getSimulatorEpoch(): Promise<number> {
    const response = await axios.get(`${config.chainSimulatorUrl}/network/status/4294967295`);
    const epoch = response.data?.data?.status?.erd_epoch_number;

    if (!Number.isInteger(epoch)) {
      throw new Error('Chain simulator returned an invalid network status response');
    }

    return epoch;
  }

  public static async deployPingPongSc(deployer: string): Promise<string> {
    try {
      const contractCodeRaw = fs.readFileSync('./src/test/chain-simulator/utils/contracts/ping-pong-egld.wasm');
      const contractArgs = [
        '0de0b6b3a7640000',
      ];

      await fundAddress(config.chainSimulatorUrl, deployer);

      const scAddress = await deploySc(new DeployScArgs({
        chainSimulatorUrl: config.chainSimulatorUrl,
        deployer: deployer,
        contractCodeRaw: contractCodeRaw,
        hexArguments: contractArgs,
      }));

      console.log(`Deployed ping pong SC. Address: ${scAddress} with deployer: ${deployer}`);
      return scAddress;
    } catch (error) {
      console.error('Error deploying ping pong SC:', error);
      throw error;
    }
  }

  public static async pingContract(sender: string, scAddress: string) {
    await sendTransaction(new SendTransactionArgs({
      chainSimulatorUrl: config.chainSimulatorUrl,
      sender,
      receiver: scAddress,
      value: '1000000000000000000',
      dataField: 'ping',
    }));
  }

  public static async pongContract(sender: string, scAddress: string) {
    await sendTransaction(new SendTransactionArgs({
      chainSimulatorUrl: config.chainSimulatorUrl,
      sender,
      receiver: scAddress,
      dataField: 'pong',
    }));
  }
}
