import { createPublicClient, http, isAddress } from "viem";
import { rootstock, rootstockTestnet } from "viem/chains";
import type { RootstockMetrics } from "../types.js";

export type Network = "mainnet" | "testnet";

/** Minimal shape of a full transaction object returned by viem getBlock. */
type MinTx = {
  to: `0x${string}` | null;
  hash: `0x${string}`;
};

export class RootstockMetricsService {
  // Typed loosely so we can switch chains without complex generics.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any;
  private readonly network: Network;
  private readonly rpcUrl: string;
  private readonly TOTAL_TIMEOUT = 45_000;

  constructor(rpcUrl?: string, network: Network = "mainnet") {
    this.network = network;
    this.rpcUrl = rpcUrl ?? this.defaultRpcUrl(network);
    const chain = network === "testnet" ? rootstockTestnet : rootstock;
    this.client = createPublicClient({
      chain,
      // Per-call timeout via the transport layer; no dangling promises.
      transport: http(this.rpcUrl, { timeout: 8_000, retryCount: 1 }),
    });
  }

  getNetwork(): Network {
    return this.network;
  }

  getRpcUrl(): string {
    return this.rpcUrl;
  }

  private defaultRpcUrl(network: Network): string {
    return network === "testnet"
      ? (process.env["ROOTSTOCK_TESTNET_RPC_URL"] ??
          "https://public-node.testnet.rsk.co")
      : (process.env["ROOTSTOCK_MAINNET_RPC_URL"] ??
          "https://public-node.rsk.co");
  }

  /** Public entry point — adds an overall deadline on top of per-call timeouts. */
  async getMetrics(contractAddress: string): Promise<RootstockMetrics> {
    return Promise.race([
      this.fetchMetrics(contractAddress),
      new Promise<RootstockMetrics>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Rootstock metrics timed out after ${this.TOTAL_TIMEOUT}ms`
              )
            ),
          this.TOTAL_TIMEOUT
        )
      ),
    ]);
  }

  private async fetchMetrics(contractAddress: string): Promise<RootstockMetrics> {
    if (!isAddress(contractAddress)) {
      throw new Error(`Invalid contract address: ${contractAddress}`);
    }

    const addr = contractAddress.toLowerCase() as `0x${string}`;

    let currentBlock: number;
    try {
      currentBlock = Number(await this.client.getBlockNumber());
    } catch {
      return this.emptyMetrics(
        contractAddress,
        `Could not reach Rootstock ${this.network} RPC (${this.rpcUrl}). Check your connection or use --rpc-url.`
      );
    }

    let latestCode: string | undefined;
    try {
      latestCode = await this.client.getBytecode({
        address: addr,
        blockNumber: BigInt(currentBlock),
      });
    } catch {
      latestCode = undefined;
    }

    if (!latestCode || latestCode === "0x") {
      return this.emptyMetrics(
        contractAddress,
        `No contract found at this address on Rootstock ${this.network}. ` +
          `Verify the address is correct and try --network testnet if it was deployed to testnet.`
      );
    }

    const deploymentBlock = await this.findDeploymentBlock(addr, currentBlock);

    if (deploymentBlock === null) {
      return {
        contractAddress,
        deploymentBlock: null,
        totalTransactionCount: 0,
        lastTransactionTimestamp: null,
        gasUsagePatterns: { average: 0, min: 0, max: 0 },
      };
    }

    const [txCount, lastTx, gasPatterns] = await Promise.allSettled([
      this.estimateTransactionCount(addr, deploymentBlock, currentBlock),
      this.findLastTransaction(addr, deploymentBlock, currentBlock),
      this.sampleGasUsage(addr, deploymentBlock, currentBlock),
    ]);

    return {
      contractAddress,
      deploymentBlock,
      totalTransactionCount:
        txCount.status === "fulfilled" ? txCount.value : 0,
      lastTransactionTimestamp:
        lastTx.status === "fulfilled" ? lastTx.value : null,
      gasUsagePatterns:
        gasPatterns.status === "fulfilled"
          ? gasPatterns.value
          : { average: 0, min: 0, max: 0 },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private emptyMetrics(contractAddress: string, note: string): RootstockMetrics {
    return {
      contractAddress,
      deploymentBlock: null,
      totalTransactionCount: 0,
      lastTransactionTimestamp: null,
      gasUsagePatterns: { average: 0, min: 0, max: 0 },
      note,
    };
  }

  // ─── Deployment block ────────────────────────────────────────────────────────

  private async findDeploymentBlock(
    address: `0x${string}`,
    currentBlock: number
  ): Promise<number | null> {
    try {
      const latestCode: string | undefined = await this.client.getBytecode({
        address,
        blockNumber: BigInt(currentBlock),
      });
      if (!latestCode || latestCode === "0x") {
        return null;
      }

      // Find a no-code lower bound by stepping back exponentially.
      let upperWithCode = currentBlock;
      let step = 1;
      let foundNoCode = false;
      let lowerNoCode = -1;
      while (step <= currentBlock) {
        const probe = currentBlock - step;
        if (probe < 0) break;
        try {
          const code: string | undefined = await this.client.getBytecode({
            address,
            blockNumber: BigInt(probe),
          });
          if (code && code !== "0x") {
            upperWithCode = probe;
            step *= 2;
            continue;
          }
          foundNoCode = true;
          lowerNoCode = probe;
          break;
        } catch {
          break;
        }
      }

      const low = foundNoCode ? lowerNoCode + 1 : 0;
      const high = upperWithCode;
      return this.binarySearchDeployment(address, low, high);
    } catch {
      return null;
    }
  }

  private async binarySearchDeployment(
    address: `0x${string}`,
    low: number,
    high: number
  ): Promise<number> {
    let lo = low;
    let hi = high;

    for (let i = 0; i < 14 && lo < hi; i++) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        const code: string | undefined = await this.client.getBytecode({
          address,
          blockNumber: BigInt(mid),
        });
        if (code && code !== "0x") {
          hi = mid;
        } else {
          lo = mid + 1;
        }
      } catch {
        // If a specific block fails, assume code was absent and move forward.
        lo = mid + 1;
      }
    }

    return lo;
  }

  // ─── Transaction count (sampling-based estimate) ─────────────────────────────

  private async estimateTransactionCount(
    address: `0x${string}`,
    deploymentBlock: number,
    currentBlock: number
  ): Promise<number> {
    try {
      const searchEnd = currentBlock;
      const totalBlocks = searchEnd - deploymentBlock + 1;
      const sampleSize = Math.min(30, totalBlocks);
      const step = Math.max(1, Math.floor(totalBlocks / sampleSize));

      let count = 0;
      let samplesChecked = 0;

      for (
        let block = deploymentBlock;
        block <= searchEnd && samplesChecked < sampleSize;
        block += step
      ) {
        try {
          const b = await this.client.getBlock({
            blockNumber: BigInt(block),
            includeTransactions: true,
          });
          if (b?.transactions) {
            for (const tx of b.transactions as MinTx[]) {
              if (tx?.to?.toLowerCase() === address) count++;
            }
          }
          samplesChecked++;
        } catch {
          continue;
        }
      }

      if (samplesChecked > 0 && step > 1) {
        return Math.round((count / samplesChecked) * totalBlocks);
      }
      return count;
    } catch {
      return 0;
    }
  }

  // ─── Last transaction timestamp ───────────────────────────────────────────────

  private async findLastTransaction(
    address: `0x${string}`,
    deploymentBlock: number,
    currentBlock: number
  ): Promise<string | null> {
    try {
      // Search a wider recent window to avoid false N/A values.
      const searchFloor = Math.max(deploymentBlock, currentBlock - 50_000);
      const maxChecks = 80;
      const span = Math.max(1, currentBlock - searchFloor);
      const step = Math.max(1, Math.floor(span / maxChecks));

      for (let i = 0; i < maxChecks; i++) {
        const block = currentBlock - i * step;
        if (block < searchFloor) break;

        try {
          const b = await this.client.getBlock({
            blockNumber: BigInt(block),
            includeTransactions: true,
          });
          if (b?.transactions) {
            for (const tx of b.transactions as MinTx[]) {
              if (tx?.to?.toLowerCase() === address) {
                return new Date(Number(b.timestamp) * 1000).toISOString();
              }
            }
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

  // ─── Gas usage patterns (from actual receipts — correct approach) ─────────────

  private async sampleGasUsage(
    address: `0x${string}`,
    deploymentBlock: number,
    currentBlock: number
  ): Promise<{ average: number; min: number; max: number }> {
    const empty = { average: 0, min: 0, max: 0 };
    try {
      const searchFloor = Math.max(deploymentBlock, currentBlock - 20_000);
      const maxChecks = 80;
      const maxSamples = 20;
      const span = Math.max(1, currentBlock - searchFloor);
      const step = Math.max(1, Math.floor(span / maxChecks));
      const gasUsages: number[] = [];

      for (let i = 0; i < maxChecks && gasUsages.length < maxSamples; i++) {
        const block = currentBlock - i * step;
        if (block < searchFloor) break;

        try {
          const b = await this.client.getBlock({
            blockNumber: BigInt(block),
            includeTransactions: true,
          });
          if (!b?.transactions) continue;

          for (const tx of b.transactions as MinTx[]) {
            if (gasUsages.length >= maxSamples) break;
            if (tx?.to?.toLowerCase() !== address) continue;

            try {
              // Fetch the receipt to get actual gasUsed — tx objects in blocks
              // do NOT carry gasUsed; only receipts do.
              const receipt = await this.client.getTransactionReceipt({
                hash: tx.hash,
              });
              if (receipt?.gasUsed != null) {
                gasUsages.push(Number(receipt.gasUsed));
              }
            } catch {
              continue;
            }
          }
        } catch {
          continue;
        }
      }

      if (gasUsages.length === 0) return empty;

      const sum = gasUsages.reduce((a, b) => a + b, 0);
      return {
        average: Math.round(sum / gasUsages.length),
        min: Math.min(...gasUsages),
        max: Math.max(...gasUsages),
      };
    } catch {
      return empty;
    }
  }
}
