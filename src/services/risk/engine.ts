import {
  AssetPriceMap,
  AssetSymbol,
  BorrowPosition,
  LiquidationParameters,
  PositionHealthSnapshot,
  PositionLiquidationSummary,
  ProtocolId,
  ProtocolRiskConfig,
  ProtocolSimulationResult,
  RiskSimulationConfig,
  RiskSimulationResult,
} from "./types.js";
import { fetchAssetPrices, fetchBorrowerPositions } from "./dataSources.js";
import {
  SOVRYN_PROTOCOL_ID,
  SOVRYN_RISK_CONFIG,
} from "./protocols/sovryn.js";
import {
  TROPYKUS_PROTOCOL_ID,
  TROPYKUS_RISK_CONFIG,
} from "./protocols/tropykus.js";
import { buildProtocolSimulationResult, buildRiskSimulationResult } from "./reporting.js";
import { estimateInsolvencyThresholdForProtocol } from "./reporting.js";

const DEFAULT_PROTOCOL_CONFIGS: Record<ProtocolId, ProtocolRiskConfig> = {
  "sovryn-v1": SOVRYN_RISK_CONFIG,
  "tropykus-v2": TROPYKUS_RISK_CONFIG,
};

function applyShockToPrices(
  basePrices: AssetPriceMap,
  shockPercentage: number,
  shockedAssets?: AssetSymbol[]
): AssetPriceMap {
  const shocked: AssetPriceMap = {};
  const factor = Math.max(0, 1 - shockPercentage / 100);

  const impactedAssets =
    shockedAssets && shockedAssets.length > 0
      ? shockedAssets
      : (Object.keys(basePrices) as AssetSymbol[]);

  for (const [symbol, price] of Object.entries(basePrices)) {
    const sym = symbol as AssetSymbol;
    if (sym === "usd") {
      shocked[symbol] = price;
      continue;
    }
    if (impactedAssets.includes(sym)) {
      shocked[symbol] = price * factor;
    } else {
      shocked[symbol] = price;
    }
  }

  return shocked;
}

function valueExposure(
  exposures: { asset: AssetSymbol; amount: number }[],
  prices: AssetPriceMap
): number {
  return exposures.reduce((sum, e) => {
    const price = prices[e.asset] ?? 0;
    return sum + e.amount * price;
  }, 0);
}

function computeHealthFactor(
  collateralUsd: number,
  debtUsd: number,
  liquidationThreshold: number
): number {
  if (debtUsd <= 0) return 1e30;
  const adjustedCollateral = collateralUsd * liquidationThreshold;
  return adjustedCollateral / debtUsd;
}

function mergeLiquidationParams(
  base: LiquidationParameters,
  override?: Partial<LiquidationParameters>
): LiquidationParameters {
  if (!override) return base;
  return {
    maxLtv: override.maxLtv ?? base.maxLtv,
    liquidationThreshold: override.liquidationThreshold ?? base.liquidationThreshold,
    closeFactor: override.closeFactor ?? base.closeFactor,
    liquidationBonus: override.liquidationBonus ?? base.liquidationBonus,
  };
}

function simulateLiquidationForPosition(
  position: BorrowPosition,
  pricesAfter: AssetPriceMap,
  params: LiquidationParameters
): PositionLiquidationSummary | undefined {
  const collateralValue = valueExposure(position.collateral, pricesAfter);
  const debtValue = valueExposure(position.debt, pricesAfter);

  if (debtValue <= 0 || collateralValue <= 0) {
    return {
      positionId: position.id,
      protocol: position.protocol,
      account: position.account,
      totalBadDebtUsd: 0,
      collateralDeficitUsd: 0,
      steps: [],
    };
  }

  const isLiquidatable = (collateralUsd: number, debtUsd: number): boolean => {
    if (debtUsd <= 0) return false;
    if (collateralUsd <= 0) return true;
    const ltv = debtUsd / collateralUsd;
    const hf = computeHealthFactor(
      collateralUsd,
      debtUsd,
      params.liquidationThreshold
    );
    return ltv > params.maxLtv || hf < 1;
  };

  if (!isLiquidatable(collateralValue, debtValue)) {
    return {
      positionId: position.id,
      protocol: position.protocol,
      account: position.account,
      totalBadDebtUsd: 0,
      collateralDeficitUsd: 0,
      steps: [],
    };
  }

  const steps: PositionLiquidationSummary["steps"] = [];

  let remainingCollateral = collateralValue;
  let remainingDebt = debtValue;

  const maxSteps = 60;
  const minDebtEpsilon = 1e-9;

  for (let i = 0; i < maxSteps; i++) {
    if (remainingDebt <= minDebtEpsilon || remainingCollateral <= 0) break;
    if (!isLiquidatable(remainingCollateral, remainingDebt)) break;

    const repayDebt = remainingDebt * params.closeFactor;
    const collateralToSeize = repayDebt * (1 + params.liquidationBonus);

    let actualRepay = repayDebt;
    let actualCollateralSeized = collateralToSeize;
    let liquidationBonusUsd = repayDebt * params.liquidationBonus;

    if (actualCollateralSeized > remainingCollateral) {
      const ratio = remainingCollateral / actualCollateralSeized;
      actualCollateralSeized = remainingCollateral;
      actualRepay = repayDebt * ratio;
      liquidationBonusUsd = actualRepay * params.liquidationBonus;
    }

    remainingCollateral -= actualCollateralSeized;
    remainingDebt -= actualRepay;

    steps.push({
      positionId: position.id,
      protocol: position.protocol,
      closeFactorApplied: params.closeFactor,
      debtRepaidUsd: actualRepay,
      collateralSeizedUsd: actualCollateralSeized - liquidationBonusUsd,
      liquidationBonusUsd,
      badDebtUsd: 0,
    });
  }

  let totalBadDebtUsd = 0;
  let collateralDeficitUsd = 0;

  if (remainingDebt > minDebtEpsilon && (remainingCollateral <= 0 || isLiquidatable(remainingCollateral, remainingDebt))) {
    totalBadDebtUsd = remainingDebt;
    collateralDeficitUsd = remainingDebt;
  }

  return {
    positionId: position.id,
    protocol: position.protocol,
    account: position.account,
    totalBadDebtUsd,
    collateralDeficitUsd,
    steps,
  };
}

async function fetchPositionsForProtocols(
  protocols: ProtocolId[],
  options: { timeoutMs: number; isExternal: boolean }
): Promise<Record<ProtocolId, BorrowPosition[]>> {
  const entries = await Promise.all(
    protocols.map(async (id) => {
      const positions = await fetchBorrowerPositions(id, {
        timeoutMs: options.timeoutMs,
        isExternal: options.isExternal,
      });
      return [id, positions] as const;
    })
  );

  const result: Record<ProtocolId, BorrowPosition[]> = {
    "sovryn-v1": [],
    "tropykus-v2": [],
  };

  for (const [id, positions] of entries) {
    result[id] = positions;
  }

  return result;
}

function simulateProtocols(params: {
  protocolIds: ProtocolId[];
  positionsByProtocol: Record<ProtocolId, BorrowPosition[]>;
  pricesBefore: AssetPriceMap;
  pricesAfter: AssetPriceMap;
  config: RiskSimulationConfig;
}): ProtocolSimulationResult[] {
  const protocolResults: ProtocolSimulationResult[] = [];

  for (const protocolId of params.protocolIds) {
    const positions = params.positionsByProtocol[protocolId] ?? [];

    const baseConfig = DEFAULT_PROTOCOL_CONFIGS[protocolId].liquidation;
    const override = params.config.protocolConfigs?.[protocolId];
    const liquidationParams = mergeLiquidationParams(baseConfig, override);

    const healthSnapshots: PositionHealthSnapshot[] = [];
    const liquidationSummaries: PositionLiquidationSummary[] = [];

    for (const position of positions) {
      const collateralBefore = valueExposure(position.collateral, params.pricesBefore);
      const debtBefore = valueExposure(position.debt, params.pricesBefore);
      const hfBefore = computeHealthFactor(
        collateralBefore,
        debtBefore,
        liquidationParams.liquidationThreshold
      );

      const collateralAfter = valueExposure(position.collateral, params.pricesAfter);
      const debtAfter = valueExposure(position.debt, params.pricesAfter);
      const hfAfter = computeHealthFactor(
        collateralAfter,
        debtAfter,
        liquidationParams.liquidationThreshold
      );

      const ltvAfter =
        debtAfter <= 0 ? 0 : collateralAfter > 0 ? debtAfter / collateralAfter : Number.POSITIVE_INFINITY;
      const liquidatable = hfAfter < 1 || ltvAfter > liquidationParams.maxLtv;

      healthSnapshots.push({
        positionId: position.id,
        protocol: position.protocol,
        account: position.account,
        collateralValueBefore: collateralBefore,
        debtValueBefore: debtBefore,
        healthFactorBefore: hfBefore,
        collateralValueAfter: collateralAfter,
        debtValueAfter: debtAfter,
        healthFactorAfter: hfAfter,
        liquidatable,
      });

      if (liquidatable) {
        const summary = simulateLiquidationForPosition(
          position,
          params.pricesAfter,
          liquidationParams
        );
        if (summary) liquidationSummaries.push(summary);
      }
    }

    protocolResults.push(
      buildProtocolSimulationResult(protocolId, healthSnapshots, liquidationSummaries)
    );
  }

  return protocolResults;
}

export async function runRiskSimulation(
  config: RiskSimulationConfig
): Promise<RiskSimulationResult> {
  const protocolIds = config.protocols;
  const timeoutMs = config.timeoutMs ?? 30000;
  const isExternal = config.isExternal ?? false;

  const [basePrices, positionsByProtocol] = await Promise.all([
    fetchAssetPrices({ isExternal, timeoutMs }),
    fetchPositionsForProtocols(protocolIds, { timeoutMs, isExternal }),
  ]);

  const shockedPrices = applyShockToPrices(
    basePrices,
    config.shockPercentage,
    config.shockedAssets
  );

  const prices = {
    before: basePrices,
    after: shockedPrices,
  };

  const protocolResults = simulateProtocols({
    protocolIds,
    positionsByProtocol,
    pricesBefore: basePrices,
    pricesAfter: shockedPrices,
    config,
  });

  const insolvencyThresholds: RiskSimulationResult["insolvencyThresholds"] = {};

  for (const protocolId of protocolIds) {
    const positions = positionsByProtocol[protocolId] ?? [];
    const collateralUsd = positions.reduce(
      (sum, p) => sum + valueExposure(p.collateral, basePrices),
      0
    );

    const estimate = estimateInsolvencyThresholdForProtocol({
      config,
      protocolId,
      protocolCollateralUsd: collateralUsd,
      computeBadDebtUsdAtShock: (shockPercentage: number) => {
        const pricesAfter = applyShockToPrices(basePrices, shockPercentage, config.shockedAssets);
        const results = simulateProtocols({
          protocolIds: [protocolId],
          positionsByProtocol,
          pricesBefore: basePrices,
          pricesAfter,
          config: { ...config, shockPercentage, protocols: [protocolId] },
        });
        return results[0]?.totalBadDebtUsd ?? 0;
      },
    });

    if (estimate) insolvencyThresholds[protocolId] = estimate;
  }

  return buildRiskSimulationResult(config, prices, protocolResults, insolvencyThresholds);
}

