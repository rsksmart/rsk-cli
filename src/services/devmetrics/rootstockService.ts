import { Address, createPublicClient, getAddress, Hex, http, PublicClient } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import { GasUsagePatterns, RootstockMetrics } from "../../types/devmetrics.js";
import { redactRpcUrl, validateRpcUrl } from "../../utils/devmetrics/rpcUrl.js";

export type Network = "mainnet" | "testnet";

export class RootstockService {
  private readonly client: PublicClient;
  private readonly network: Network;
  private readonly rpcUrl: string;

  private readonly rpcTimeoutMs = 5000;
  private readonly totalTimeoutMs = 45000;
  private readonly maxDeploymentSearchBlocks = 10000;
  private readonly maxTransactionSearchBlocks = 2000;

  private constructor(rpcUrl: string, network: Network) {
    this.network = network;
    this.rpcUrl = rpcUrl;
    this.client = createPublicClient({
      chain: this.network === "testnet" ? rootstockTestnet : rootstock,
      transport: http(this.rpcUrl),
    });
  }

  static async create(rpcUrl?: string, network?: Network, allowPrivateRpc: boolean = false): Promise<RootstockService> {
    const resolvedNetwork = network || (rpcUrl && rpcUrl.includes("testnet") ? "testnet" : "mainnet");
    const resolvedRpcUrl =
      rpcUrl ||
      (resolvedNetwork === "testnet"
        ? process.env.ROOTSTOCK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co"
        : process.env.ROOTSTOCK_MAINNET_RPC_URL || "https://public-node.rsk.co");

    await validateRpcUrl(resolvedRpcUrl, { allowPrivateRpc });
    return new RootstockService(resolvedRpcUrl, resolvedNetwork);
  }

  getNetwork(): Network {
    return this.network;
  }

  getRedactedRpcUrl(): string {
    return redactRpcUrl(this.rpcUrl);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.rpcTimeoutMs): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`RPC call timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  }

  async getMetrics(contractAddress: string): Promise<RootstockMetrics> {
    return this.withTimeout(this.fetchMetrics(contractAddress), this.totalTimeoutMs);
  }

  private async fetchMetrics(contractAddress: string): Promise<RootstockMetrics> {
    try {
      const normalizedAddress = getAddress(contractAddress) as Address;
      const currentBlockBigInt = await this.withTimeout(this.client.getBlockNumber(), 5000);
      const currentBlock = Number(currentBlockBigInt);
      const deploymentBlock = await this.getDeploymentBlock(normalizedAddress, currentBlock);

      if (!deploymentBlock) {
        return {
          contractAddress: normalizedAddress,
          deploymentBlock: null,
          totalTransactionCount: 0,
          lastTransactionTimestamp: null,
          gasUsagePatterns: { average: 0, min: 0, max: 0 },
        };
      }

      const [transactionCount, lastTransaction, gasUsagePatterns] = await Promise.allSettled([
        this.getTransactionCount(normalizedAddress, deploymentBlock, currentBlock),
        this.getLastTransaction(normalizedAddress, deploymentBlock, currentBlock),
        this.getGasUsagePatterns(normalizedAddress, deploymentBlock, currentBlock),
      ]);

      return {
        contractAddress: normalizedAddress,
        deploymentBlock,
        totalTransactionCount: transactionCount.status === "fulfilled" ? transactionCount.value : 0,
        lastTransactionTimestamp: lastTransaction.status === "fulfilled" ? lastTransaction.value : null,
        gasUsagePatterns:
          gasUsagePatterns.status === "fulfilled"
            ? gasUsagePatterns.value
            : { average: 0, min: 0, max: 0 },
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Rootstock metrics: ${error?.message || "Unknown error"}`);
    }
  }

  private async getDeploymentBlock(contractAddress: Address, currentBlock: number): Promise<number | null> {
    const searchStartBlock = Math.max(0, currentBlock - this.maxDeploymentSearchBlocks);

    try {
      const bytecode = await this.withTimeout(this.client.getBytecode({ address: contractAddress }), 5000);
      if (!bytecode || bytecode === "0x") return null;
      return this.binarySearchDeployment(contractAddress, searchStartBlock, currentBlock);
    } catch {
      return null;
    }
  }

  private async binarySearchDeployment(contractAddress: Address, low: number, high: number): Promise<number> {
    let left = low;
    let right = high;
    let iterations = 0;
    const maxIterations = 18;

    while (left < right && iterations < maxIterations) {
      iterations += 1;
      const mid = Math.floor((left + right) / 2);
      try {
        const code = await this.withTimeout(
          this.client.getBytecode({ address: contractAddress, blockNumber: BigInt(mid) }),
          3000
        );
        if (code && code !== "0x") {
          right = mid;
        } else {
          left = mid + 1;
        }
      } catch {
        return left;
      }
    }

    return left;
  }

  private async getTransactionCount(contractAddress: Address, deploymentBlock: number, currentBlock: number): Promise<number> {
    const searchEndBlock = Math.min(currentBlock, deploymentBlock + this.maxTransactionSearchBlocks);
    const sampleSize = 20;
    const step = Math.max(1, Math.floor((searchEndBlock - deploymentBlock) / sampleSize));
    let count = 0;
    let checked = 0;

    for (let block = deploymentBlock; block <= searchEndBlock && checked < sampleSize; block += step) {
      try {
        const blockData = await this.withTimeout(
          this.client.getBlock({ blockNumber: BigInt(block), includeTransactions: true }),
          3000
        );
        const txs = blockData.transactions as Array<{ to: Address | null } | Hex>;
        const matches = txs.filter((tx) => {
          if (typeof tx === "string") return false;
          return tx.to?.toLowerCase() === contractAddress.toLowerCase();
        }).length;
        count += matches;
        checked += 1;
      } catch {
        continue;
      }
    }

    if (checked > 0 && step > 1) {
      const averagePerSample = count / checked;
      const totalBlocks = searchEndBlock - deploymentBlock + 1;
      return Math.round(averagePerSample * totalBlocks);
    }

    return count;
  }

  private async getLastTransaction(contractAddress: Address, deploymentBlock: number, currentBlock: number): Promise<string | null> {
    const searchStep = 100;
    const maxChecks = 20;
    const searchStartBlock = Math.max(deploymentBlock, currentBlock - 500);

    for (let i = 0; i < maxChecks; i++) {
      const block = currentBlock - i * searchStep;
      if (block < searchStartBlock) break;

      try {
        const blockData = await this.withTimeout(
          this.client.getBlock({ blockNumber: BigInt(block), includeTransactions: true }),
          3000
        );
        const txs = blockData.transactions as Array<{ to: Address | null } | Hex>;
        const found = txs.find((tx) => {
          if (typeof tx === "string") return false;
          return tx.to?.toLowerCase() === contractAddress.toLowerCase();
        });
        if (found) {
          return new Date(Number(blockData.timestamp) * 1000).toISOString();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async getGasUsagePatterns(
    contractAddress: Address,
    deploymentBlock: number,
    currentBlock: number
  ): Promise<GasUsagePatterns> {
    const gasUsages: number[] = [];
    const sampleSize = 20;
    const searchStep = 50;
    const maxChecks = 10;
    const searchStartBlock = Math.max(deploymentBlock, currentBlock - 200);

    for (let i = 0; i < maxChecks && gasUsages.length < sampleSize; i++) {
      const block = currentBlock - i * searchStep;
      if (block < searchStartBlock) break;

      try {
        const blockData = await this.withTimeout(
          this.client.getBlock({ blockNumber: BigInt(block), includeTransactions: true }),
          3000
        );
        const txs = blockData.transactions as Array<{ hash: Hex; to: Address | null } | Hex>;
        const matched = txs.filter((tx) => {
          if (typeof tx === "string") return false;
          return tx.to?.toLowerCase() === contractAddress.toLowerCase();
        });

        for (const tx of matched) {
          if (typeof tx === "string" || gasUsages.length >= sampleSize) continue;
          try {
            const receipt = await this.withTimeout(this.client.getTransactionReceipt({ hash: tx.hash }), 3000);
            gasUsages.push(Number(receipt.gasUsed));
          } catch {
            continue;
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
    return {
      average: Math.round(sum / gasUsages.length),
      min: Math.min(...gasUsages),
      max: Math.max(...gasUsages),
    };
  }
}
