export type DevMetricsOutputFormat = "table" | "json" | "markdown";

export type GitHubMetrics = {
  stars: number;
  lastCommitDate: string | null;
  openIssuesCount: number;
  pullRequestsCount: number;
  contributorCount: number;
  repository: string;
};

export type GasUsagePatterns = {
  average: number;
  min: number;
  max: number;
};

export type RootstockMetrics = {
  contractAddress: string;
  deploymentBlock: number | null;
  totalTransactionCount: number;
  lastTransactionTimestamp: string | null;
  gasUsagePatterns: GasUsagePatterns;
};

export type DevMetricsReport = {
  repository: string;
  contractAddress: string;
  github: GitHubMetrics;
  rootstock: RootstockMetrics;
  timestamp: string;
};

export type DevMetricsPair = {
  repo: string;
  contract: string;
};

export type DevMetricsError = {
  pair: DevMetricsPair;
  error: string;
};

export type DevMetricsMeta = {
  network: "mainnet" | "testnet";
  pairCount: number;
  successCount: number;
  errorCount: number;
  generatedAt: string;
  rpcUrl: string;
};

export type DevMetricsResultData = {
  reports: DevMetricsReport[];
  errors: DevMetricsError[];
  meta: DevMetricsMeta;
};

export type DevMetricsCommandResult = {
  success: boolean;
  data?: DevMetricsResultData;
  error?: string;
};

export type DevMetricsCommandOptions = {
  repo: string[];
  contract: string[];
  format?: string;
  ci?: boolean;
  githubToken?: string;
  network?: string;
  rpcUrl?: string;
  allowPrivateRpc?: boolean;
  maxPairs?: string;
  isExternal?: boolean;
};
