import {
  InsolvencyThresholdEstimate,
  PositionHealthSnapshot,
  ProtocolId,
  ProtocolSimulationResult,
  RiskSimulationConfig,
  RiskSimulationResult,
} from "./types.js";

/**
 * Aggregate protocol-level metrics from per-position snapshots and liquidation summaries.
 */
export function buildProtocolSimulationResult(
  protocol: ProtocolId,
  positions: PositionHealthSnapshot[],
  liquidations: ProtocolSimulationResult["liquidations"]
): ProtocolSimulationResult {
  const totalBadDebtUsd = liquidations.reduce(
    (sum, p) => sum + p.totalBadDebtUsd,
    0
  );

  const totalCollateralDeficitUsd = liquidations.reduce(
    (sum, p) => sum + p.collateralDeficitUsd,
    0
  );

  return {
    protocol,
    positions,
    liquidations,
    totalBadDebtUsd,
    totalCollateralDeficitUsd,
  };
}

/**
 * Compute a very simple insolvency threshold estimate for a single protocol
 * by extrapolating linearly from the current shock and resulting bad debt.
 *
 * This is a heuristic and should be refined once more precise models are available.
 */
export function estimateInsolvencyThresholdForProtocol(
  config: RiskSimulationConfig,
  protocolResult: ProtocolSimulationResult
): InsolvencyThresholdEstimate | undefined {
  const currentShock = config.shockPercentage;
  const currentBadDebt = protocolResult.totalBadDebtUsd;

  if (currentShock <= 0 || currentBadDebt <= 0) {
    return undefined;
  }

  // Linear heuristic: assume bad debt grows roughly proportional to shock.
  // We treat the current shock as the insolvency threshold if any bad debt appears.
  return {
    shockPercentage: currentShock,
    badDebtUsd: currentBadDebt,
  };
}

/**
 * Final assembly helper for RiskSimulationResult, aggregating protocol results
 * and computing global totals and insolvency threshold estimates.
 */
export function buildRiskSimulationResult(
  config: RiskSimulationConfig,
  prices: RiskSimulationResult["prices"],
  protocolResults: ProtocolSimulationResult[]
): RiskSimulationResult {
  const totals = protocolResults.reduce(
    (acc, p) => {
      acc.totalBadDebtUsd += p.totalBadDebtUsd;
      acc.totalCollateralDeficitUsd += p.totalCollateralDeficitUsd;
      return acc;
    },
    { totalBadDebtUsd: 0, totalCollateralDeficitUsd: 0 }
  );

  const insolvencyThresholds: RiskSimulationResult["insolvencyThresholds"] = {};

  for (const result of protocolResults) {
    const estimate = estimateInsolvencyThresholdForProtocol(config, result);
    if (estimate) {
      insolvencyThresholds[result.protocol] = estimate;
    }
  }

  return {
    config,
    prices,
    protocols: protocolResults,
    totals,
    insolvencyThresholds,
  };
}

