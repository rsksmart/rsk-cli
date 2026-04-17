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
export function estimateInsolvencyThresholdForProtocol(params: {
  config: RiskSimulationConfig;
  protocolId: ProtocolId;
  protocolCollateralUsd: number;
  computeBadDebtUsdAtShock: (shockPercentage: number) => number;
}): InsolvencyThresholdEstimate | undefined {
  const ratio = params.config.insolvencyBadDebtRatio ?? 0.01;
  if (!Number.isFinite(ratio) || ratio <= 0) return undefined;

  const targetBadDebt = params.protocolCollateralUsd * ratio;
  if (!Number.isFinite(targetBadDebt) || targetBadDebt <= 0) return undefined;

  const lowBound = 0;
  const highBound = 99;

  let low = lowBound;
  let high = highBound;

  const badDebtAtHigh = params.computeBadDebtUsdAtShock(high);
  if (!(badDebtAtHigh >= targetBadDebt)) {
    return undefined;
  }

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const badDebt = params.computeBadDebtUsdAtShock(mid);
    if (badDebt >= targetBadDebt) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const shock = high;
  const badDebt = params.computeBadDebtUsdAtShock(shock);

  return {
    shockPercentage: shock,
    badDebtUsd: badDebt,
  };
}

/**
 * Final assembly helper for RiskSimulationResult, aggregating protocol results
 * and computing global totals and insolvency threshold estimates.
 */
export function buildRiskSimulationResult(
  config: RiskSimulationConfig,
  prices: RiskSimulationResult["prices"],
  protocolResults: ProtocolSimulationResult[],
  insolvencyThresholds: RiskSimulationResult["insolvencyThresholds"] = {}
): RiskSimulationResult {
  const totals = protocolResults.reduce(
    (acc, p) => {
      acc.totalBadDebtUsd += p.totalBadDebtUsd;
      acc.totalCollateralDeficitUsd += p.totalCollateralDeficitUsd;
      return acc;
    },
    { totalBadDebtUsd: 0, totalCollateralDeficitUsd: 0 }
  );

  return {
    config,
    prices,
    protocols: protocolResults,
    totals,
    insolvencyThresholds,
  };
}

