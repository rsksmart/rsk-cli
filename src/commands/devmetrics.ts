import chalk from "chalk";
import { GitHubService } from "../services/github.service.js";
import {
  RootstockService,
  DevMetricsNetwork,
} from "../services/rootstock.service.js";
import {
  validateRepo,
  validateContractAddress,
} from "../utils/devmetricsValidation.js";
import { formatReport } from "../formatters/devmetrics/index.js";
import { DevMetricsReport, OutputFormat } from "../utils/types.js";
import {
  logError,
  logMessage,
  logWarning,
  logSuccess,
} from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

export interface DevMetricsOptions {
  /** GitHub repos in "owner/repo" format — supports multiple values */
  repos: string[];
  /** Rootstock contract addresses — supports multiple values */
  contracts: string[];
  /** Output format: table | json | markdown */
  format?: OutputFormat;
  /** CI mode: forces JSON output */
  ci?: boolean;
  /** GitHub personal access token (overrides GITHUB_TOKEN env var) */
  githubToken?: string;
  /** Rootstock network: mainnet | testnet */
  network?: DevMetricsNetwork;
  /** Rootstock RPC URL (overrides --network). Must use http:// or https://. */
  rpcUrl?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validates that --rpc-url is a well-formed URL restricted to http/https.
 * Rejects file://, ftp://, javascript:, bare hostnames, etc.
 * Prints an error and exits 1 on any violation.
 */
function validateRpcUrl(rpcUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    logError(
      false,
      `Invalid --rpc-url: "${rpcUrl}" is not a valid URL.`
    );
    process.exit(1);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    logError(
      false,
      `Invalid --rpc-url protocol "${parsed.protocol.replace(":", "")}://". Only http:// and https:// are permitted.`
    );
    process.exit(1);
  }
}

/**
 * Splits a validated "owner/repo" string into its two parts.
 * Although validateRepo() has already confirmed the format upstream, we guard
 * here explicitly so the function remains safe in isolation — protecting against
 * any future code path that bypasses the pre-validation block.
 */
function splitRepo(repo: string): { owner: string; repoName: string } {
  const slashIdx = repo.indexOf("/");
  if (slashIdx === -1 || slashIdx === 0 || slashIdx === repo.length - 1) {
    throw new Error(
      `Invalid repository format: "${repo}". Expected "owner/repo".`
    );
  }
  const owner = repo.slice(0, slashIdx);
  const repoName = repo.slice(slashIdx + 1);
  if (!owner || !repoName) {
    throw new Error(
      `Repository owner or name must not be empty in: "${repo}".`
    );
  }
  return { owner, repoName };
}

// ─── Command ─────────────────────────────────────────────────────────────────

export async function devmetricsCommand(
  options: DevMetricsOptions
): Promise<void> {
  const { repos, contracts, ci, githubToken, rpcUrl } = options;

  // ── 1. Validate --rpc-url protocol (SSRF guard) ──────────────────────────
  if (rpcUrl !== undefined) {
    validateRpcUrl(rpcUrl);
  }

  // ── 2. Resolve and validate network ──────────────────────────────────────
  const rawNetwork = options.network?.toLowerCase();
  if (rawNetwork && rawNetwork !== "mainnet" && rawNetwork !== "testnet") {
    logError(
      false,
      `Invalid --network: "${options.network}". Must be "mainnet" or "testnet".`
    );
    process.exit(1);
  }
  const network: DevMetricsNetwork =
    (rawNetwork as DevMetricsNetwork) ?? "mainnet";

  // ── 3. Resolve output format ──────────────────────────────────────────────
  const VALID_FORMATS: OutputFormat[] = ["table", "json", "markdown"];
  let outputFormat: OutputFormat = "table";
  if (ci) {
    outputFormat = "json";
  } else if (options.format) {
    if (VALID_FORMATS.includes(options.format)) {
      outputFormat = options.format;
    } else {
      logError(
        false,
        `Invalid --format: "${options.format}". Must be one of: ${VALID_FORMATS.join(", ")}.`
      );
      process.exit(1);
    }
  }

  // In non-table modes (json / markdown) all progress/status messages are
  // suppressed so that stdout carries only the formatted report data.
  // The logger/spinner accept an isExternal-equivalent flag for this purpose.
  const silent = outputFormat !== "table";

  // ── 4. Require at least one repo and contract ─────────────────────────────
  if (repos.length === 0) {
    logError(false, "At least one repository is required (--repo owner/repo).");
    process.exit(1);
  }
  if (contracts.length === 0) {
    logError(
      false,
      "At least one contract address is required (--contract 0x...)."
    );
    process.exit(1);
  }

  // ── 5. Build repo/contract pairs ──────────────────────────────────────────
  const pairs: Array<{ repo: string; contract: string }> = [];

  if (repos.length === contracts.length) {
    for (let i = 0; i < repos.length; i++) {
      pairs.push({ repo: repos[i], contract: contracts[i] });
    }
  } else if (contracts.length === 1) {
    // Fan-out: one contract applied to all repos
    for (const repo of repos) {
      pairs.push({ repo, contract: contracts[0] });
    }
  } else if (repos.length === 1) {
    // Fan-out: one repo applied to all contracts
    for (const contract of contracts) {
      pairs.push({ repo: repos[0], contract });
    }
  } else {
    logError(
      false,
      "Number of --repo and --contract values must match, or one must be a single value."
    );
    process.exit(1);
  }

  // ── 6. Validate all pairs up-front ────────────────────────────────────────
  const validationErrors: string[] = [];
  for (const pair of pairs) {
    const repoResult = validateRepo(pair.repo);
    if (!repoResult.valid) {
      validationErrors.push(`Repository "${pair.repo}": ${repoResult.error}`);
    }
    const contractResult = validateContractAddress(pair.contract);
    if (!contractResult.valid) {
      validationErrors.push(
        `Contract "${pair.contract}": ${contractResult.error}`
      );
    }
  }
  if (validationErrors.length > 0) {
    logError(false, "Validation errors:");
    validationErrors.forEach((err) => logError(false, `  - ${err}`));
    process.exit(1);
  }

  // ── 7. Instantiate services ───────────────────────────────────────────────
  const githubService = new GitHubService(githubToken);
  const rootstockService = new RootstockService(rpcUrl, network);

  // ── 8. Pre-flight status display (table mode only) ────────────────────────
  logMessage(
    silent,
    `🌐 Rootstock Network: ${chalk.bold(rootstockService.getNetwork().toUpperCase())}`,
    chalk.cyan
  );
  logMessage(
    silent,
    `   RPC: ${rootstockService.getRpcUrl()}\n`,
    chalk.gray
  );

  if (!githubService.isAuthenticated()) {
    logWarning(
      silent,
      "⚠️  No GitHub token detected. Using unauthenticated mode (60 requests/hour)."
    );
    logWarning(
      silent,
      "   Set GITHUB_TOKEN in your environment or pass --github-token for 5,000/hour.\n"
    );
  }

  // Show remaining GitHub rate-limit budget
  try {
    const rateLimit = await githubService.getRateLimitStatus();
    if (rateLimit) {
      const pct = ((rateLimit.remaining / rateLimit.limit) * 100).toFixed(1);
      const color =
        rateLimit.remaining < rateLimit.limit * 0.1
          ? chalk.red
          : rateLimit.remaining < rateLimit.limit * 0.3
          ? chalk.yellow
          : chalk.green;
      logMessage(
        silent,
        `📊 GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining (${pct}%)`,
        color
      );
      if (rateLimit.remaining < rateLimit.limit * 0.2) {
        logWarning(
          silent,
          `   Rate limit resets at: ${rateLimit.resetAt.toLocaleString()}`
        );
      }
    }
  } catch {
    // Non-fatal — proceed without rate-limit info
  }

  // ── 9. Fetch metrics per pair ─────────────────────────────────────────────
  const reports: DevMetricsReport[] = [];
  const errors: Array<{
    pair: { repo: string; contract: string };
    error: string;
  }> = [];

  // One spinner instance reused across operations to keep output sequential
  const spinner = createSpinner(silent);

  for (const pair of pairs) {
    logMessage(
      silent,
      `\n📊 Fetching metrics for ${chalk.bold(pair.repo)}...`,
      chalk.blue
    );

    try {
      // Defensive split — safe because validateRepo() passed above, but we
      // guard explicitly so this function is safe in isolation.
      const { owner, repoName } = splitRepo(pair.repo);

      // GitHub metrics
      let githubMetrics;
      spinner.start("Fetching GitHub data...");
      try {
        githubMetrics = await githubService.getMetrics(owner, repoName);
        spinner.succeed("GitHub data fetched");
      } catch (err: any) {
        spinner.fail("GitHub data fetch failed");
        throw err;
      }

      // Rootstock on-chain metrics
      let rootstockMetrics;
      spinner.start("Fetching Rootstock data...");
      try {
        rootstockMetrics = await rootstockService.getMetrics(pair.contract);
        spinner.succeed("Rootstock data fetched");
      } catch (err: any) {
        spinner.fail("Rootstock data fetch failed");
        throw err;
      }

      reports.push({
        repository: pair.repo,
        contractAddress: pair.contract,
        github: githubMetrics,
        rootstock: rootstockMetrics,
        timestamp: new Date().toISOString(),
      });

      logSuccess(silent, `✅ Metrics collected for ${pair.repo}`);
    } catch (error: any) {
      errors.push({
        pair,
        error: error.message ?? "Unknown error",
      });
    }
  }

  // ── 10. Output reports ────────────────────────────────────────────────────
  if (reports.length > 0) {
    // formatReport returns a string; console.log is correct here — it is the
    // primary data output, not a status message, so it is always printed.
    console.log(formatReport(reports, outputFormat));
  }

  // ── 11. Surface per-pair errors ───────────────────────────────────────────
  if (errors.length > 0) {
    if (outputFormat === "json") {
      // In JSON/CI mode errors are structured so tools can parse them
      console.error(JSON.stringify({ errors }, null, 2));
    } else {
      logError(false, "\n❌ Errors encountered:");
      errors.forEach(({ pair, error }) =>
        logError(false, `  ${pair.repo} / ${pair.contract}: ${error}`)
      );
    }
    process.exit(1);
  }

  if (reports.length === 0) {
    process.exit(1);
  }
}
