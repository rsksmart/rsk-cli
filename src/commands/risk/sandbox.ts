import { RiskSimulationConfig, RiskSimulationResult } from "../../services/risk/types.js";
import { runRiskSimulation } from "../../services/risk/engine.js";
import { createSpinner } from "../../utils/spinner.js";
import { logError, logInfo, logSuccess } from "../../utils/logger.js";

export interface RiskSandboxCliOptions {
  ltv?: number;
  threshold?: number;
  isExternal?: boolean;
}

function formatNumber(value: number, decimals = 2): string {
  if (!isFinite(value)) return "∞";
  return value.toFixed(decimals);
}

function buildComparisonSummaryTable(
  baseResult: RiskSimulationResult,
  sandboxResult: RiskSimulationResult
): string {
  const headers = [
    "Protocol",
    "Scenario",
    "Bad Debt (USD)",
    "Collateral Deficit (USD)",
  ];

  const rows: string[][] = [];

  for (const base of baseResult.protocols) {
    const sandbox = sandboxResult.protocols.find(
      (p) => p.protocol === base.protocol
    );
    if (!sandbox) continue;

    rows.push([
      base.protocol,
      "base",
      formatNumber(base.totalBadDebtUsd),
      formatNumber(base.totalCollateralDeficitUsd),
    ]);
    rows.push([
      base.protocol,
      "sandbox",
      formatNumber(sandbox.totalBadDebtUsd),
      formatNumber(sandbox.totalCollateralDeficitUsd),
    ]);
  }

  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, colIdx) =>
    Math.max(...allRows.map((row) => row[colIdx].length))
  );

  const formatRow = (row: string[]) =>
    row
      .map((cell, idx) => cell.padEnd(colWidths[idx]))
      .join("  ");

  const lines: string[] = [];
  lines.push(formatRow(headers));
  lines.push(colWidths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) {
    lines.push(formatRow(row));
  }

  return lines.join("\n");
}

export async function riskSandboxCommand(
  options: RiskSandboxCliOptions
): Promise<{ base: RiskSimulationResult; sandbox: RiskSimulationResult } | void> {
  const isExternal = options.isExternal ?? false;

  if (options.ltv !== undefined && (options.ltv <= 0 || options.ltv >= 100)) {
    logError(isExternal, "LTV must be between 0 and 100 (exclusive).");
    return;
  }

  if (
    options.threshold !== undefined &&
    (options.threshold <= 0 || options.threshold >= 100)
  ) {
    logError(
      isExternal,
      "Liquidation threshold must be between 0 and 100 (exclusive)."
    );
    return;
  }

  const spinner = createSpinner(isExternal);

  try {
    // Run base simulation with default protocol parameters and a moderate shock.
    const baseConfig: RiskSimulationConfig = {
      shockPercentage: 30,
      // Focus on Sovryn v1 for now; Tropykus will be enabled later.
      protocols: ["sovryn-v1"],
      protocolConfigs: {},
    };

    spinner.start("Running base risk simulation...");
    const baseResult = await runRiskSimulation(baseConfig);
    spinner.succeed("Base simulation completed.");

    const protocolOverride = {
      maxLtv:
        options.ltv !== undefined ? options.ltv / 100 : undefined,
      liquidationThreshold:
        options.threshold !== undefined ? options.threshold / 100 : undefined,
    };

    const sandboxConfig: RiskSimulationConfig = {
      shockPercentage: baseConfig.shockPercentage,
      protocols: baseConfig.protocols,
      protocolConfigs: {
        "sovryn-v1": protocolOverride,
      },
    };

    spinner.start("Running sandbox simulation with custom parameters...");
    const sandboxResult = await runRiskSimulation(sandboxConfig);
    spinner.succeed("Sandbox simulation completed.");

    const table = buildComparisonSummaryTable(baseResult, sandboxResult);

    logInfo(isExternal, "\n📊 Risk Sandbox Comparison\n");
    logInfo(isExternal, table);

    logSuccess(
      isExternal,
      "\nSandbox simulation complete. Review how bad debt and collateral deficits change under the new parameters."
    );

    return { base: baseResult, sandbox: sandboxResult };
  } catch (error: any) {
    spinner.fail("Risk sandbox simulation failed.");
    logError(
      isExternal,
      `Error during risk sandbox simulation: ${error?.message || String(error)}`
    );
  }
}

