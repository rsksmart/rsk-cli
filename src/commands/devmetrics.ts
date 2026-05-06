import { createSpinner } from "../utils/spinner.js";
import { logError, logInfo, logWarning } from "../utils/logger.js";
import {
  DevMetricsCommandOptions,
  DevMetricsCommandResult,
  DevMetricsOutputFormat,
  DevMetricsReport,
} from "../types/devmetrics.js";
import { validateRpcUrl, redactRpcUrl } from "../utils/devmetrics/rpcUrl.js";
import {
  buildPairs,
  parseAndValidateMaxPairs,
  parseRepoIdentifier,
  validateContractAddress,
  validateOutputFormat,
  validateRepo,
} from "../utils/devmetrics/validation.js";
import { GitHubService } from "../services/devmetrics/githubService.js";
import { Network, RootstockService } from "../services/devmetrics/rootstockService.js";
import { formatDevMetricsReport } from "../formatters/devmetrics/index.js";

export async function devMetricsCommand(params: DevMetricsCommandOptions): Promise<DevMetricsCommandResult> {
  const isExternal = params.isExternal || !!params.ci;
  const spinner = createSpinner(isExternal);

  try {
    const network: Network = params.network?.toLowerCase() === "testnet" ? "testnet" : "mainnet";
    if (params.network && !["mainnet", "testnet"].includes(params.network.toLowerCase())) {
      return { success: false, error: `Invalid network: ${params.network}. Must be 'mainnet' or 'testnet'.` };
    }

    let outputFormat: DevMetricsOutputFormat = "table";
    if (params.ci) {
      outputFormat = "json";
    } else if (params.format) {
      outputFormat = validateOutputFormat(params.format) ? params.format : "table";
    }

    if (!params.ci && params.format && !validateOutputFormat(params.format)) {
      return { success: false, error: `Invalid format: ${params.format}. Must be table, json, or markdown.` };
    }

    if (!params.repo?.length) {
      return { success: false, error: "At least one --repo value is required." };
    }

    if (!params.contract?.length) {
      return { success: false, error: "At least one --contract value is required." };
    }

    const { pairs, error: pairingError } = buildPairs(params.repo, params.contract);
    if (pairingError) {
      return { success: false, error: pairingError };
    }

    const { maxPairs, error: maxPairsError } = parseAndValidateMaxPairs(params.maxPairs);
    if (maxPairsError) {
      return { success: false, error: maxPairsError };
    }

    if (pairs.length > maxPairs) {
      return {
        success: false,
        error: `Too many repo/contract combinations (${pairs.length}); max is ${maxPairs}.`,
      };
    }

    for (const pair of pairs) {
      const repoValidation = validateRepo(pair.repo);
      if (!repoValidation.valid) {
        return { success: false, error: `Repository "${pair.repo}": ${repoValidation.error}` };
      }
      const contractValidation = validateContractAddress(pair.contract);
      if (!contractValidation.valid) {
        return { success: false, error: `Contract "${pair.contract}": ${contractValidation.error}` };
      }
    }

    const effectiveRpcUrl =
      params.rpcUrl ||
      (network === "testnet"
        ? process.env.ROOTSTOCK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co"
        : process.env.ROOTSTOCK_MAINNET_RPC_URL || "https://public-node.rsk.co");

    await validateRpcUrl(effectiveRpcUrl, { allowPrivateRpc: !!params.allowPrivateRpc });

    if (params.githubToken) {
      const trimmedToken = params.githubToken.trim();
      const tokenPattern = /^[A-Za-z0-9_]+$/;
      if (trimmedToken.length < 20 || trimmedToken.length > 255 || !tokenPattern.test(trimmedToken)) {
        return {
          success: false,
          error: "Invalid --github-token format. Use a valid token or set GITHUB_TOKEN env var.",
        };
      }
      if (!params.ci) {
        logWarning(
          isExternal,
          "Using --github-token may expose secrets in shell history/process lists. Prefer GITHUB_TOKEN environment variable."
        );
      }
    }

    const githubService = new GitHubService(params.githubToken);
    const rootstockService = await RootstockService.create(effectiveRpcUrl, network, !!params.allowPrivateRpc);

    if (outputFormat === "table") {
      logInfo(isExternal, `Rootstock Network: ${network.toUpperCase()}`);
      logInfo(isExternal, `RPC URL: ${rootstockService.getRedactedRpcUrl()}`);
      if (!githubService.isAuthenticated()) {
        logWarning(
          isExternal,
          "No GitHub token detected. Unauthenticated mode has strict rate limits. Set GITHUB_TOKEN for higher throughput."
        );
      }
    }

    const reports: DevMetricsReport[] = [];
    const errors: Array<{ pair: { repo: string; contract: string }; error: string }> = [];

    for (const pair of pairs) {
      const parsedRepo = parseRepoIdentifier(pair.repo);
      if (!parsedRepo.owner || !parsedRepo.repo) {
        errors.push({
          pair,
          error: parsedRepo.error || `Invalid repository identifier "${pair.repo}"`,
        });
        continue;
      }

      spinner.start(`Fetching metrics for ${pair.repo}...`);
      try {
        const github = await githubService.getMetrics(parsedRepo.owner, parsedRepo.repo);
        const rootstock = await rootstockService.getMetrics(pair.contract);

        reports.push({
          repository: pair.repo,
          contractAddress: pair.contract,
          github,
          rootstock,
          timestamp: new Date().toISOString(),
        });
        spinner.succeed(`Fetched metrics for ${pair.repo}`);
      } catch (error: any) {
        spinner.fail(`Failed metrics for ${pair.repo}`);
        errors.push({
          pair,
          error: error?.message || "Unknown error",
        });
      }
    }

    const resultData = {
      reports,
      errors,
      meta: {
        network,
        pairCount: pairs.length,
        successCount: reports.length,
        errorCount: errors.length,
        generatedAt: new Date().toISOString(),
        rpcUrl: redactRpcUrl(effectiveRpcUrl),
      },
    };

    if (!isExternal && reports.length > 0 && !params.ci) {
      const formatted = formatDevMetricsReport(reports, outputFormat);
      logInfo(isExternal, formatted);
    }

    if (!isExternal && errors.length > 0 && !params.ci) {
      for (const item of errors) {
        logError(isExternal, `${item.pair.repo} / ${item.pair.contract}: ${item.error}`);
      }
    }

    return {
      success: reports.length > 0,
      data: resultData,
      error: reports.length === 0 ? "No reports were generated." : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to run devmetrics command",
    };
  }
}
