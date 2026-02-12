import chalk from "chalk";
import ora from "ora";
import { Address } from "viem";
import { GitHubDevMetricsService } from "../devmetrics/githubService.js";
import { RootstockDevMetricsService } from "../devmetrics/rootstockService.js";
import {
  DevMetricsReport,
  OutputFormat,
} from "../devmetrics/types.js";
import {
  validateRepo as validateRepoInput,
  validateContractAddress as validateContractInput,
} from "../devmetrics/validation.js";
import { formatDevMetricsReport } from "../devmetrics/formatters/index.js";

type DevMetricsCommandOptions = {
  repos: string[];
  contracts: string[];
  format: OutputFormat;
  ci?: boolean;
  githubToken?: string;
  testnet?: boolean;
  isExternal?: boolean;
};

type LogColor = (msg: string) => string;

function logMessage(
  opts: DevMetricsCommandOptions,
  message: string,
  color: LogColor = (m) => m,
) {
  if (!opts.isExternal) {
    console.log(color(message));
  }
}

export async function devmetricsCommand(
  options: DevMetricsCommandOptions,
): Promise<{ reports: DevMetricsReport[]; errors: Array<{ repo: string; contract: string; error: string }> }> {
  const outputFormat: OutputFormat = options.format;

  const pairs: Array<{ repo: string; contract: string }> = [];
  const repos = options.repos;
  const contracts = options.contracts;

  if (repos.length === contracts.length) {
    for (let i = 0; i < repos.length; i++) {
      pairs.push({ repo: repos[i], contract: contracts[i] });
    }
  } else if (contracts.length === 1) {
    for (const repo of repos) {
      pairs.push({ repo, contract: contracts[0] });
    }
  } else if (repos.length === 1) {
    for (const contract of contracts) {
      pairs.push({ repo: repos[0], contract });
    }
  } else {
    throw new Error(
      "Number of repositories and contracts must match, or one must be singular",
    );
  }

  const validationErrors: string[] = [];

  for (const pair of pairs) {
    const repoValidation = validateRepoInput(pair.repo);
    if (!repoValidation.valid) {
      validationErrors.push(
        `Repository "${pair.repo}": ${repoValidation.error ?? "Invalid format"}`,
      );
    }

    const contractValidation = validateContractInput(pair.contract);
    if (!contractValidation.valid) {
      validationErrors.push(
        `Contract "${pair.contract}": ${contractValidation.error ?? "Invalid format"}`,
      );
    }
  }

  if (validationErrors.length > 0) {
    const errorText = ["Validation errors:", ...validationErrors.map((e) => `  - ${e}`)].join(
      "\n",
    );
    throw new Error(errorText);
  }

  const githubService = new GitHubDevMetricsService(options.githubToken);
  const rootstockService = new RootstockDevMetricsService(!!options.testnet);

  if (outputFormat === "table") {
    logMessage(
      options,
      chalk.cyan(
        `🌐 Rootstock Network: ${chalk.bold(
          options.testnet ? "TESTNET" : "MAINNET",
        )}`,
      ),
    );
    logMessage(
      options,
      chalk.gray(
        `   (RPC URL managed by existing rsk-cli ViemProvider configuration)\n`,
      ),
    );
  }

  const initialAuthStatus = githubService.isAuthenticated();

  if (!initialAuthStatus && outputFormat === "table") {
    logMessage(
      options,
      chalk.yellow(
        "\n⚠️  No GitHub token detected. Using unauthenticated mode (60 requests/hour limit).",
      ),
    );
    logMessage(
      options,
      chalk.yellow(
        "   For 5,000 requests/hour, set a GITHUB_TOKEN environment variable.\n",
      ),
    );
  }

  if (outputFormat === "table") {
    try {
      const rateLimit = await githubService.getRateLimitStatus();
      if (rateLimit) {
        const percentage = ((rateLimit.remaining / rateLimit.limit) * 100).toFixed(1);
        const color =
          rateLimit.remaining < rateLimit.limit * 0.1
            ? chalk.red
            : rateLimit.remaining < rateLimit.limit * 0.3
            ? chalk.yellow
            : chalk.green;
        logMessage(
          options,
          color(
            `📊 GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining (${percentage}%)`,
          ),
        );
        if (rateLimit.remaining < rateLimit.limit * 0.2) {
          logMessage(
            options,
            chalk.yellow(
              `   Rate limit resets at: ${rateLimit.resetAt.toLocaleString()}`,
            ),
          );
        }
      }
    } catch {
      // ignore rate limit fetch errors
    }
  }

  const reports: DevMetricsReport[] = [];
  const errors: Array<{ repo: string; contract: string; error: string }> = [];

  for (const pair of pairs) {
    try {
      if (outputFormat === "table") {
        logMessage(
          options,
          chalk.blue(`\n📊 Fetching metrics for ${pair.repo}...`),
        );
      }

      const [owner, repo] = pair.repo.split("/");

      let githubMetrics;
      try {
        if (outputFormat === "table") {
          if (!options.isExternal) {
            process.stdout.write(chalk.gray("   Fetching GitHub data... "));
          }
        }
        githubMetrics = await githubService.getMetrics(owner, repo);
        if (outputFormat === "table") {
          logMessage(options, chalk.green("✓"));
        }
      } catch (error: any) {
        if (outputFormat === "table") {
          logMessage(options, chalk.red("✗"));
        }
        throw error;
      }

      let rootstockMetrics;
      try {
        if (outputFormat === "table") {
          if (!options.isExternal) {
            process.stdout.write(chalk.gray("   Fetching Rootstock data... "));
          }
        }
        rootstockMetrics = await rootstockService.getMetrics(
          pair.contract,
          !!options.testnet,
        );
        if (outputFormat === "table") {
          logMessage(options, chalk.green("✓"));
        }
      } catch (error: any) {
        if (outputFormat === "table") {
          logMessage(options, chalk.red("✗"));
        }
        throw error;
      }

      const report: DevMetricsReport = {
        repository: pair.repo,
        contractAddress: rootstockMetrics.contractAddress as Address,
        github: githubMetrics,
        rootstock: rootstockMetrics,
        timestamp: new Date().toISOString(),
      };

      reports.push(report);
    } catch (error: any) {
      errors.push({
        repo: pair.repo,
        contract: pair.contract,
        error: error?.message || "Unknown error",
      });
    }
  }

  if (reports.length > 0 && !options.isExternal) {
    const output = formatDevMetricsReport(reports, outputFormat);
    console.log(output);
  }

  return { reports, errors };
}

