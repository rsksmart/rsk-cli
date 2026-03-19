export interface GitHubMetrics {
  stars: number;
  lastCommitDate: string | null;
  openIssuesCount: number;
  pullRequestsCount: number;
  contributorCount: number;
  repository: string;
}

export interface RootstockMetrics {
  contractAddress: string;
  deploymentBlock: number | null;
  totalTransactionCount: number;
  lastTransactionTimestamp: string | null;
  gasUsagePatterns: {
    average: number;
    min: number;
    max: number;
  };
  /** Human-readable note shown in output when data is partial (e.g. no bytecode found). */
  note?: string;
}

export interface DevMetricsReport {
  repository: string;
  contractAddress: string;
  github: GitHubMetrics;
  rootstock: RootstockMetrics;
  timestamp: string;
}

export type OutputFormat = "table" | "json" | "markdown";

export interface DevMetricsOptions {
  repos: string[];
  contracts: string[];
  format: OutputFormat;
  ci: boolean;
  githubToken?: string;
  network: "mainnet" | "testnet";
  rpcUrl?: string;
}
