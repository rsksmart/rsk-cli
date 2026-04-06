import { RiskSimulationConfig, RiskSimulationResult, AssetSymbol } from "../../services/risk/types.js";
import { runRiskSimulation } from "../../services/risk/engine.js";
import { createSpinner } from "../../utils/spinner.js";
import { logError, logInfo, logSuccess } from "../../utils/logger.js";

export interface RiskSimulateCliOptions {
  shock: number;
  asset?: string;
  isExternal?: boolean;
}

function formatNumber(value: number, decimals = 2): string {
  if (!isFinite(value)) return "∞";
  return value.toFixed(decimals);
}

function buildProtocolSummaryTable(result: RiskSimulationResult): string {
  const headers = [
    "Protocol",
    "Bad Debt (USD)",
    "Collateral Deficit (USD)",
    "Positions",
    "Liquidatable",
  ];

  const rows = result.protocols.map((p) => {
    const positions = p.positions.length;
    const liquidatable = p.positions.filter((pos) => pos.liquidatable).length;
    return [
      p.protocol,
      formatNumber(p.totalBadDebtUsd, 2),
      formatNumber(p.totalCollateralDeficitUsd, 2),
      String(positions),
      String(liquidatable),
    ];
  });

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

export async function riskSimulateCommand(
  options: RiskSimulateCliOptions
): Promise<RiskSimulationResult | void> {
  const isExternal = options.isExternal ?? false;

  if (options.shock <= 0) {
    logError(isExternal, "Shock percentage must be greater than zero.");
    return;
  }

  const config: RiskSimulationConfig = {
    shockPercentage: options.shock,
    shockedAssets: options.asset
      ? [options.asset.toLowerCase() as AssetSymbol]
      : undefined,
    // Currently we only rely on Sovryn v1 data; Tropykus will be added
    // back once its indexer/subgraph is stable.
    protocols: ["sovryn-v1"],
    protocolConfigs: {},
  };

  const spinner = createSpinner(isExternal);

  try {
    spinner.start(
      `Running risk simulation with ${options.shock}% price shock...`
    );

    const result = await runRiskSimulation(config);

    spinner.succeed("Risk simulation completed.");

    const table = buildProtocolSummaryTable(result);

    logInfo(isExternal, "\n📊 Risk Simulation Summary\n");
    logInfo(isExternal, table);
    logSuccess(
      isExternal,
      `\nTotal Bad Debt (USD): ${formatNumber(
        result.totals.totalBadDebtUsd,
        2
      )}`
    );
    logSuccess(
      isExternal,
      `Total Collateral Deficit (USD): ${formatNumber(
        result.totals.totalCollateralDeficitUsd,
        2
      )}`
    );

    return result;
  } catch (error: any) {
    spinner.fail("Risk simulation failed.");
    logError(
      isExternal,
      `Error during risk simulation: ${error?.message || String(error)}`
    );
  }
}

