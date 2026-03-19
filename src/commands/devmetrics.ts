import chalk from "chalk";
import { GitHubService } from "../devmetrics/services/githubService.js";
import {
  RootstockMetricsService,
  type Network,
} from "../devmetrics/services/rootstockService.js";
import { formatReport } from "../devmetrics/formatters/index.js";
import {
  validateRepo,
  validateContractAddress,
  validateOutputFormat,
} from "../devmetrics/validation.js";
import type {
  DevMetricsOptions,
  DevMetricsReport,
  OutputFormat,
} from "../devmetrics/types.js";

// ─── Public command entry point ────────────────────────────────────────────────

export async function devmetricsCommand(
  opts: DevMetricsOptions
): Promise<void> {
  // 1. Resolve output format (--ci overrides --format)
  let format: OutputFormat = "table";
  if (opts.ci) {
    format = "json";
  } else if (opts.format) {
    if (!validateOutputFormat(opts.format)) {
      console.error(
        chalk.red(
          `❌ Invalid format "${opts.format}". Must be one of: table, json, markdown.`
        )
      );
      process.exit(1);
    }
    format = opts.format as OutputFormat;
  }

  // 2. Ensure at least one repo and one contract were provided
  if (opts.repos.length === 0) {
    console.error(
      chalk.red(
        "❌ At least one repository is required (use --repo owner/repo)."
      )
    );
    process.exit(1);
  }
  if (opts.contracts.length === 0) {
    console.error(
      chalk.red(
        "❌ At least one contract address is required (use --contract 0x...)."
      )
    );
    process.exit(1);
  }

  // 3. Validate network flag
  if (opts.network && !["mainnet", "testnet"].includes(opts.network)) {
    console.error(
      chalk.red(
        `❌ Invalid network "${opts.network}". Must be "mainnet" or "testnet".`
      )
    );
    process.exit(1);
  }
  const network = (opts.network ?? "mainnet") as Network;

  // 4. Build repo/contract pairs
  const pairs = buildPairs(opts.repos, opts.contracts);
  if (pairs === null) {
    console.error(
      chalk.red(
        "❌ The number of --repo and --contract flags must match, or one of them must be a single value applied to all."
      )
    );
    process.exit(1);
  }

  // 5. Validate every repo name and address
  const validationErrors: string[] = [];
  for (const p of pairs) {
    const rv = validateRepo(p.repo);
    if (!rv.valid) validationErrors.push(`Repo "${p.repo}": ${rv.error}`);

    const cv = validateContractAddress(p.contract);
    if (!cv.valid)
      validationErrors.push(`Contract "${p.contract}": ${cv.error}`);
  }
  if (validationErrors.length > 0) {
    console.error(chalk.red("❌ Validation errors:"));
    validationErrors.forEach((e) => console.error(chalk.red(`   • ${e}`)));
    process.exit(1);
  }

  // 6. Initialise services
  const github = new GitHubService(opts.githubToken);
  const rootstockSvc = new RootstockMetricsService(opts.rpcUrl, network);

  // 7. Print header (table mode only — keep JSON/Markdown clean)
  if (format === "table") {
    console.log(
      chalk.cyan(
        `\n🌐 Rootstock Network: ${chalk.bold(rootstockSvc.getNetwork().toUpperCase())}`
      )
    );
    console.log(chalk.gray(`   RPC: ${rootstockSvc.getRpcUrl()}\n`));

    if (!github.isAuthenticated()) {
      console.log(
        chalk.yellow(
          "⚠️  No GitHub token detected — using unauthenticated mode (60 req/hour)."
        )
      );
      console.log(
        chalk.yellow(
          "   Pass --github-token or set GITHUB_TOKEN for 5,000 req/hour.\n"
        )
      );
    }

    try {
      const rl = await github.getRateLimitStatus();
      if (rl) {
        const pct = ((rl.remaining / rl.limit) * 100).toFixed(1);
        const color =
          rl.remaining < rl.limit * 0.1
            ? chalk.red
            : rl.remaining < rl.limit * 0.3
            ? chalk.yellow
            : chalk.green;
        console.log(
          color(
            `📊 GitHub API: ${rl.remaining}/${rl.limit} requests remaining (${pct}%)\n`
          )
        );
      }
    } catch {
      // Rate-limit check is best-effort; never block the main flow.
    }
  }

  // 8. Fetch data for each pair, collect results and errors
  const reports: DevMetricsReport[] = [];
  const errors: Array<{ pair: { repo: string; contract: string }; error: string }> = [];

  for (const pair of pairs) {
    try {
      if (format === "table") {
        console.log(chalk.blue(`📡 Fetching metrics for ${pair.repo}…`));
      }

      const [owner, repo] = pair.repo.split("/") as [string, string];

      // GitHub
      let githubMetrics;
      try {
        if (format === "table") process.stdout.write(chalk.gray("   GitHub data…    "));
        githubMetrics = await github.getMetrics(owner, repo);
        if (format === "table") console.log(chalk.green("✓"));
      } catch (err: any) {
        if (format === "table") console.log(chalk.red("✗"));
        throw err;
      }

      // Rootstock (non-fatal: a missing/undeployed contract returns a note instead of throwing)
      let rootstockMetrics;
      try {
        if (format === "table") process.stdout.write(chalk.gray("   Rootstock data… "));
        rootstockMetrics = await rootstockSvc.getMetrics(pair.contract);
        if (format === "table") {
          if (rootstockMetrics.note) {
            console.log(chalk.yellow("⚠️  (partial — see report)"));
          } else {
            console.log(chalk.green("✓"));
          }
        }
      } catch (err: any) {
        if (format === "table") console.log(chalk.red("✗"));
        throw err;
      }

      reports.push({
        repository: pair.repo,
        contractAddress: pair.contract,
        github: githubMetrics,
        rootstock: rootstockMetrics,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      errors.push({ pair, error: err.message ?? "Unknown error" });
    }
  }

  // 9. Output results
  if (reports.length > 0) {
    console.log(formatReport(reports, format));
  }

  // 10. Report any per-pair hard errors (GitHub failures, timeouts, etc.)
  if (errors.length > 0) {
    if (format === "json") {
      console.error(JSON.stringify({ errors }, null, 2));
    } else {
      console.error(chalk.red("\n❌ Errors encountered:"));
      errors.forEach(({ pair, error }) =>
        console.error(chalk.red(`   ${pair.repo} / ${pair.contract}: ${error}`))
      );
    }
    // Only exit non-zero when there are genuine hard failures.
    if (reports.length === 0) process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPairs(
  repos: string[],
  contracts: string[]
): Array<{ repo: string; contract: string }> | null {
  if (repos.length === contracts.length) {
    return repos.map((repo, i) => ({ repo, contract: contracts[i] }));
  }
  if (contracts.length === 1) {
    return repos.map((repo) => ({ repo, contract: contracts[0] }));
  }
  if (repos.length === 1) {
    return contracts.map((contract) => ({ repo: repos[0], contract }));
  }
  return null; // mismatch
}
