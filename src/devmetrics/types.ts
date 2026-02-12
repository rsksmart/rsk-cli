import { Address } from "viem";

export interface GitHubMetrics {
  stars: number;
  lastCommitDate: string | null;
  openIssuesCount: number;
  pullRequestsCount: number;
  contributorCount: number;
  repository: string;
}

export interface RootstockMetrics {
  contractAddress: Address;
  deploymentBlock: number | null;
  totalTransactionCount: number;
  lastTransactionTimestamp: string | null;
  gasUsagePatterns: {
    average: number;
    min: number;
    max: number;
  };
}

export interface DevMetricsReport {
  repository: string;
  contractAddress: Address;
  github: GitHubMetrics;
  rootstock: RootstockMetrics;
  timestamp: string;
}

export type OutputFormat = "table" | "json" | "markdown";

