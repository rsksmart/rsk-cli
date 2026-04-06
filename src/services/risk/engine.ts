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
  if (debtUsd <= 0) return Number.POSITIVE_INFINITY;
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

  const ltv = debtValue / collateralValue;

  if (ltv <= params.maxLtv) {
    // Not liquidatable under current rules.
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

  // Simple loop: attempt up to a few close-factor based liquidations until
  // position becomes healthy or collateral is exhausted.
  const maxSteps = 5;
  for (let i = 0; i < maxSteps; i++) {
    const currentLtv = remainingDebt / remainingCollateral;
    if (currentLtv <= params.maxLtv || remainingDebt <= 0 || remainingCollateral <= 0) {
      break;
    }

    const repayDebt = remainingDebt * params.closeFactor;
    const collateralToSeize = repayDebt * (1 + params.liquidationBonus);

    let actualRepay = repayDebt;
    let actualCollateralSeized = collateralToSeize;
    let liquidationBonusUsd = repayDebt * params.liquidationBonus;

    if (actualCollateralSeized > remainingCollateral) {
      // Not enough collateral to cover repayment + bonus; adjust down.
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

  if (remainingDebt > 0 && remainingCollateral <= 0) {
    // Collateral completely exhausted, remaining debt is bad debt.
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
  protocols: ProtocolId[]
): Promise<Record<ProtocolId, BorrowPosition[]>> {
  const entries = await Promise.all(
    protocols.map(async (id) => {
      const positions = await fetchBorrowerPositions(id, {});
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

export async function runRiskSimulation(
  config: RiskSimulationConfig
): Promise<RiskSimulationResult> {
  const protocolIds = config.protocols;

  const [basePrices, positionsByProtocol] = await Promise.all([
    fetchAssetPrices({}),
    fetchPositionsForProtocols(protocolIds),
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

  const protocolResults: ProtocolSimulationResult[] = [];

  for (const protocolId of protocolIds) {
    const positions = positionsByProtocol[protocolId] ?? [];

    const baseConfig = DEFAULT_PROTOCOL_CONFIGS[protocolId].liquidation;
    const override = config.protocolConfigs?.[protocolId];
    const liquidationParams = mergeLiquidationParams(baseConfig, override);

    const healthSnapshots: PositionHealthSnapshot[] = [];
    const liquidationSummaries: PositionLiquidationSummary[] = [];

    for (const position of positions) {
      const collateralBefore = valueExposure(position.collateral, basePrices);
      const debtBefore = valueExposure(position.debt, basePrices);
      const hfBefore = computeHealthFactor(
        collateralBefore,
        debtBefore,
        liquidationParams.liquidationThreshold
      );

      const collateralAfter = valueExposure(position.collateral, shockedPrices);
      const debtAfter = valueExposure(position.debt, shockedPrices);
      const hfAfter = computeHealthFactor(
        collateralAfter,
        debtAfter,
        liquidationParams.liquidationThreshold
      );

      const liquidatable = hfAfter < 1;

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
          shockedPrices,
          liquidationParams
        );
        if (summary) {
          liquidationSummaries.push(summary);
        }
      }
    }

    const protocolResult = buildProtocolSimulationResult(
      protocolId,
      healthSnapshots,
      liquidationSummaries
    );
    protocolResults.push(protocolResult);
  }

  return buildRiskSimulationResult(config, prices, protocolResults);
}

