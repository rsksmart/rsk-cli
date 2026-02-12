import { Address, PublicClient } from "viem";
import ViemProvider from "../utils/viemProvider.js";
import { RootstockMetrics } from "./types.js";
import { validateAndFormatAddressRSK } from "../utils/index.js";

/**
 * Rootstock metrics service for dev-metrics.
 * Reimplements the ethers-based logic from the standalone devmetrics project
 * using the existing ViemProvider used across rsk-cli.
 */
export class RootstockDevMetricsService {
  private provider: ViemProvider;
  private clientPromise: Promise<PublicClient>;
  private readonly RPC_TIMEOUT = 5_000; // per RPC call
  private readonly MAX_DEPLOYMENT_SEARCH_BLOCKS = 10_000;
  private readonly MAX_TRANSACTION_SEARCH_BLOCKS = 2_000;

  constructor(testnet: boolean) {
    this.provider = new ViemProvider(testnet);
    this.clientPromise = this.provider.getPublicClient();
  }

  private async getClient(): Promise<PublicClient> {
    return this.clientPromise;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.RPC_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`RPC call timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  async getMetrics(contract: string, testnet: boolean): Promise<RootstockMetrics> {
    const TOTAL_TIMEOUT = 45_000;

    const formatted = validateAndFormatAddressRSK(contract, testnet);
    if (!formatted) {
      throw new Error(`Invalid contract address: ${contract}`);
    }

    const contractAddress = formatted as Address;

    return Promise.race([
      this.fetchMetrics(contractAddress),
      new Promise<RootstockMetrics>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Rootstock metrics fetch timed out after ${TOTAL_TIMEOUT}ms`)),
          TOTAL_TIMEOUT,
        ),
      ),
    ]);
  }

  private async fetchMetrics(contractAddress: Address): Promise<RootstockMetrics> {
    const client = await this.getClient();

    try {
      const currentBlock = Number(await this.withTimeout(client.getBlockNumber(), 5_000));
      const deploymentBlock = await this.getDeploymentBlock(client, contractAddress, currentBlock);

      if (deploymentBlock !== null) {
        const [txCountResult, lastTxResult, gasPatternsResult] = await Promise.allSettled([
          this.getTransactionCount(client, contractAddress, deploymentBlock),
          this.getLastTransaction(client, contractAddress, deploymentBlock, currentBlock),
          this.getGasUsagePatterns(client, contractAddress, deploymentBlock, currentBlock),
        ]);

        return {
          contractAddress,
          deploymentBlock,
          totalTransactionCount: txCountResult.status === "fulfilled" ? txCountResult.value : 0,
          lastTransactionTimestamp: lastTxResult.status === "fulfilled" ? lastTxResult.value : null,
          gasUsagePatterns:
            gasPatternsResult.status === "fulfilled"
              ? gasPatternsResult.value
              : { average: 0, min: 0, max: 0 },
        };
      }

      return {
        contractAddress,
        deploymentBlock: null,
        totalTransactionCount: 0,
        lastTransactionTimestamp: null,
        gasUsagePatterns: { average: 0, min: 0, max: 0 },
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Rootstock metrics: ${error?.message || String(error)}`);
    }
  }

  private async getDeploymentBlock(
    client: PublicClient,
    contractAddress: Address,
    currentBlock: number,
  ): Promise<number | null> {
    try {
      const searchStartBlock = Math.max(0, currentBlock - this.MAX_DEPLOYMENT_SEARCH_BLOCKS);
      const latestCode = await this.withTimeout(
        client.getBytecode({ address: contractAddress, blockNumber: BigInt(currentBlock) }),
        5_000,
      );

      if (!latestCode || latestCode === "0x") {
        const chunkSize = 2_000;
        const maxChecks = 10;

        for (let i = 0; i < maxChecks; i++) {
          const block = currentBlock - i * chunkSize;
          if (block < searchStartBlock) break;

          try {
            const code = await this.withTimeout(
              client.getBytecode({ address: contractAddress, blockNumber: BigInt(block) }),
              3_000,
            );
            if (code && code !== "0x") {
              return block;
            }
          } catch {
            continue;
          }
        }
        return null;
      }

      return await this.binarySearchDeployment(client, contractAddress, searchStartBlock, currentBlock);
    } catch {
      return null;
    }
  }

  private async binarySearchDeployment(
    client: PublicClient,
    contractAddress: Address,
    low: number,
    high: number,
  ): Promise<number> {
    const maxIterations = 10;
    let iterations = 0;

    while (low < high && iterations < maxIterations) {
      iterations++;
      const mid = Math.floor((low + high) / 2);

      try {
        const code = await this.withTimeout(
          client.getBytecode({ address: contractAddress, blockNumber: BigInt(mid) }),
          3_000,
        );

        if (code && code !== "0x") {
          high = mid;
        } else {
          low = mid + 1;
        }
      } catch {
        return low;
      }
    }

    return low;
  }

  private async getTransactionCount(
    client: PublicClient,
    contractAddress: Address,
    deploymentBlock: number,
  ): Promise<number> {
    try {
      const currentBlock = Number(await this.withTimeout(client.getBlockNumber(), 5_000));
      const searchEndBlock = Math.min(currentBlock, deploymentBlock + this.MAX_TRANSACTION_SEARCH_BLOCKS);

      const sampleSize = 20;
      const step = Math.max(1, Math.floor((searchEndBlock - deploymentBlock) / sampleSize));
      let count = 0;
      let samplesChecked = 0;

      for (
        let block = deploymentBlock;
        block <= searchEndBlock && samplesChecked < sampleSize;
        block += step
      ) {
        try {
          const blockData = await this.withTimeout(
            client.getBlock({ blockNumber: BigInt(block), includeTransactions: true }),
            3_000,
          );

          const txs = blockData.transactions;
          const txCount = (txs as any[]).filter((tx) => {
            if (typeof tx === "string") return false;
            return tx.to?.toLowerCase() === contractAddress.toLowerCase();
          }).length;

          count += txCount;
          samplesChecked++;
        } catch {
          continue;
        }
      }

      if (samplesChecked > 0 && step > 1) {
        const avgPerBlock = count / samplesChecked;
        const totalBlocks = searchEndBlock - deploymentBlock + 1;
        return Math.round(avgPerBlock * totalBlocks);
      }

      return count;
    } catch {
      return 0;
    }
  }

  private async getLastTransaction(
    client: PublicClient,
    contractAddress: Address,
    deploymentBlock: number,
    currentBlock: number,
  ): Promise<string | null> {
    try {
      const searchStep = 100;
      const maxBlocksToCheck = 500;
      const searchStartBlock = Math.max(deploymentBlock, currentBlock - maxBlocksToCheck);
      const maxChecks = 20;

      for (let i = 0; i < maxChecks; i++) {
        const block = currentBlock - i * searchStep;
        if (block < searchStartBlock) break;

        try {
          const blockData = await this.withTimeout(
            client.getBlock({ blockNumber: BigInt(block), includeTransactions: true }),
            3_000,
          );

          const txs = blockData.transactions;
          const relevantTx = (txs as any[]).find((tx) => {
            if (typeof tx === "string") return false;
            return tx.to?.toLowerCase() === contractAddress.toLowerCase();
          });

          if (relevantTx) {
            const timestamp = Number(blockData.timestamp);
            return new Date(timestamp * 1000).toISOString();
          }
        } catch {
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getGasUsagePatterns(
    client: PublicClient,
    contractAddress: Address,
    deploymentBlock: number,
    currentBlock: number,
  ): Promise<{ average: number; min: number; max: number }> {
    try {
      const sampleSize = 20;
      const gasUsages: number[] = [];
      const searchStep = 50;
      const maxBlocksToCheck = 200;
      const maxChecks = 10;
      const searchStartBlock = Math.max(deploymentBlock, currentBlock - maxBlocksToCheck);

      for (let i = 0; i < maxChecks && gasUsages.length < sampleSize; i++) {
        const block = currentBlock - i * searchStep;
        if (block < searchStartBlock) break;

        try {
          const blockData = await this.withTimeout(
            client.getBlock({ blockNumber: BigInt(block), includeTransactions: true }),
            3_000,
          );

          const txs = blockData.transactions;
          const relevantTxs = (txs as any[]).filter((tx) => {
            if (typeof tx === "string") return false;
            return tx.to?.toLowerCase() === contractAddress.toLowerCase();
          });

          for (const tx of relevantTxs) {
            if (gasUsages.length >= sampleSize) break;
            if (typeof tx !== "string" && (tx as any).gasUsed != null) {
              const gasUsed = (tx as any).gasUsed;
              const num = typeof gasUsed === "bigint" ? Number(gasUsed) : Number(gasUsed);
              if (!Number.isNaN(num)) {
                gasUsages.push(num);
              }
            }
          }
        } catch {
          continue;
        }
      }

      if (gasUsages.length === 0) {
        return { average: 0, min: 0, max: 0 };
      }

      const sum = gasUsages.reduce((a, b) => a + b, 0);
      const average = Math.round(sum / gasUsages.length);
      const min = Math.min(...gasUsages);
      const max = Math.max(...gasUsages);

      return { average, min, max };
    } catch {
      return { average: 0, min: 0, max: 0 };
    }
  }
}

