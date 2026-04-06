import { RiskSimulationConfig, RiskSimulationResult } from "../../services/risk/types.js";
import { runRiskSimulation } from "../../services/risk/engine.js";
import { createSpinner } from "../../utils/spinner.js";
import { logError, logInfo } from "../../utils/logger.js";

export interface RiskReportCliOptions {
  format?: "table" | "json";
  shock?: number;
  isExternal?: boolean;
}

function formatNumber(value: number, decimals = 2): string {
  if (!isFinite(value)) return "∞";
  return value.toFixed(decimals);
}

function buildHighLevelTable(result: RiskSimulationResult): string {
  const headers = [
    "Protocol",
    "Bad Debt (USD)",
    "Collateral Deficit (USD)",
  ];

  const rows = result.protocols.map((p) => [
    p.protocol,
    formatNumber(p.totalBadDebtUsd),
    formatNumber(p.totalCollateralDeficitUsd),
  ]);

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

export async function riskReportCommand(
  options: RiskReportCliOptions
): Promise<RiskSimulationResult | void> {
  const isExternal = options.isExternal ?? false;
  const format = options.format ?? "json";

  const shock = options.shock ?? 40;
  if (shock <= 0) {
    logError(isExternal, "Shock percentage must be greater than zero.");
    return;
  }

  const config: RiskSimulationConfig = {
    shockPercentage: shock,
    // For now, only include Sovryn v1. Tropykus can be re-enabled later.
    protocols: ["sovryn-v1"],
    protocolConfigs: {},
  };

  const spinner = createSpinner(isExternal);

  try {
    spinner.start(`Running risk simulation report with ${shock}% price shock...`);

    const result = await runRiskSimulation(config);

    spinner.succeed("Risk simulation report generated.");

    if (format === "table") {
      const table = buildHighLevelTable(result);
      logInfo(isExternal, "\n📊 Risk Report\n");
      logInfo(isExternal, table);
      return result;
    }

    // JSON output, suitable for CI/CD and machine consumption.
    const json = JSON.stringify(result, null, 2);
    logInfo(isExternal, json);
    return result;
  } catch (error: any) {
    spinner.fail("Risk report generation failed.");
    logError(
      isExternal,
      `Error during risk report generation: ${error?.message || String(error)}`
    );
  }
}

