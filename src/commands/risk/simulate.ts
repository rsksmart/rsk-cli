import { RiskSimulationConfig, RiskSimulationResult, AssetSymbol } from "../../services/risk/types.js";
import { runRiskSimulation } from "../../services/risk/engine.js";
import { createSpinner } from "../../utils/spinner.js";
import { logError, logInfo, logSuccess } from "../../utils/logger.js";
import { formatNumber } from "../../utils/format.js";

export interface RiskSimulateCliOptions {
  shock: number;
  asset?: string;
  isExternal?: boolean;
}

const ALLOWED_ASSETS: AssetSymbol[] = ["rbtc", "rif", "dllr", "sov", "usd"];

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

  if (!Number.isFinite(options.shock)) {
    logError(isExternal, "Shock percentage must be a number.");
    return;
  }

  if (options.shock <= 0 || options.shock >= 100) {
    logError(isExternal, "Shock percentage must be between 0 and 100.");
    return;
  }

  const asset = options.asset?.toLowerCase();
  if (asset && !ALLOWED_ASSETS.includes(asset as AssetSymbol)) {
    logError(
      isExternal,
      `Invalid asset "${options.asset}". Allowed: ${ALLOWED_ASSETS.join(", ")}`
    );
    return;
  }

  const config: RiskSimulationConfig = {
    shockPercentage: options.shock,
    shockedAssets: asset ? [asset as AssetSymbol] : undefined,
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

