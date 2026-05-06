import { DevMetricsOutputFormat, DevMetricsPair } from "../../types/devmetrics.js";

const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HARD_MAX_PAIRS = 25;

export function validateRepo(repo: string): { valid: boolean; error?: string } {
  if (!REPO_REGEX.test(repo)) {
    return { valid: false, error: "Repository must be in format owner/repo" };
  }
  return { valid: true };
}

export function validateContractAddress(address: string): { valid: boolean; error?: string } {
  if (!ADDRESS_REGEX.test(address)) {
    return {
      valid: false,
      error: "Contract address must be a valid 0x-prefixed 40 hex string",
    };
  }
  return { valid: true };
}

export function validateOutputFormat(format: string): format is DevMetricsOutputFormat {
  return format === "table" || format === "json" || format === "markdown";
}

export function parseRepoIdentifier(
  repoIdentifier: string
): { owner?: string; repo?: string; error?: string } {
  const trimmed = repoIdentifier.trim();
  const parts = trimmed.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { error: `Invalid repository identifier "${repoIdentifier}"` };
  }
  return { owner: parts[0], repo: parts[1] };
}

export function buildPairs(repos: string[], contracts: string[]): {
  pairs: DevMetricsPair[];
  error?: string;
} {
  const pairs: DevMetricsPair[] = [];

  if (repos.length === contracts.length) {
    for (let i = 0; i < repos.length; i++) {
      pairs.push({ repo: repos[i], contract: contracts[i] });
    }
    return { pairs };
  }

  if (contracts.length === 1) {
    for (const repo of repos) {
      pairs.push({ repo, contract: contracts[0] });
    }
    return { pairs };
  }

  if (repos.length === 1) {
    for (const contract of contracts) {
      pairs.push({ repo: repos[0], contract });
    }
    return { pairs };
  }

  return {
    pairs: [],
    error: "Number of repositories and contracts must match, or one side must be singular",
  };
}

export function parseAndValidateMaxPairs(maxPairsInput?: string): {
  maxPairs: number;
  error?: string;
} {
  if (!maxPairsInput) {
    return { maxPairs: HARD_MAX_PAIRS };
  }

  const parsed = Number.parseInt(maxPairsInput, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { maxPairs: HARD_MAX_PAIRS, error: "--max-pairs must be a positive integer" };
  }

  if (parsed > HARD_MAX_PAIRS) {
    return { maxPairs: HARD_MAX_PAIRS, error: `--max-pairs cannot exceed ${HARD_MAX_PAIRS}` };
  }

  return { maxPairs: parsed };
}
