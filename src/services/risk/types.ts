export type ProtocolId = "sovryn-v1" | "tropykus-v2";

export type AssetSymbol = "rbtc" | "rif" | "dllr" | "sov" | "usd";

export interface AssetPriceMap {
  /**
   * Price in USD for each asset symbol.
   */
  [symbol: string]: number;
}

export interface AssetExposure {
  asset: AssetSymbol;
  amount: number;
}

export interface BorrowPosition {
  /**
   * Unique identifier for the position (protocol-specific).
   */
  id: string;
  /**
   * Protocol this position belongs to.
   */
  protocol: ProtocolId;
  /**
   * Account owner address (for reference only).
   */
  account: string;
  /**
   * Collateral assets posted by the borrower.
   */
  collateral: AssetExposure[];
  /**
   * Borrowed assets (liabilities).
   */
  debt: AssetExposure[];
}

export interface LiquidationParameters {
  /**
   * Maximum allowed Loan-To-Value ratio before liquidation, as a fraction (e.g. 0.75 for 75%).
   */
  maxLtv: number;
  /**
   * Liquidation threshold as a fraction of collateral value (e.g. 0.8 for 80%).
   */
  liquidationThreshold: number;
  /**
   * Portion of the position that can be liquidated at once (e.g. 0.5 for 50%).
   */
  closeFactor: number;
  /**
   * Bonus for liquidators on seized collateral (e.g. 0.05 for 5%).
   */
  liquidationBonus: number;
}

export interface ProtocolRiskConfig {
  id: ProtocolId;
  /**
   * Global/default liquidation parameters for this protocol.
   */
  liquidation: LiquidationParameters;
}

export interface RiskSimulationConfig {
  /**
   * Percentage price drop to apply (e.g. 40 means a 40% drop).
   */
  shockPercentage: number;
  /**
   * Optional subset of assets to shock; if omitted, all known assets are shocked.
   */
  shockedAssets?: AssetSymbol[];
  /**
   * Protocols to include in this simulation.
   */
  protocols: ProtocolId[];
  /**
   * Optional protocol-specific overrides for liquidation params.
   */
  protocolConfigs?: Partial<Record<ProtocolId, Partial<LiquidationParameters>>>;

  /**
   * When true, suppresses all logs (used by MCP/external consumers).
   */
  isExternal?: boolean;

  /**
   * Network timeout for external API calls (ms).
   */
  timeoutMs?: number;

  /**
   * Bad-debt ratio of protocol collateral value used to define insolvency.
   * Example: 0.01 means "insolvent when bad debt >= 1% of total collateral value".
   */
  insolvencyBadDebtRatio?: number;
}

export interface PositionHealthSnapshot {
  positionId: string;
  protocol: ProtocolId;
  account: string;
  /**
   * Total collateral value before the shock (in USD).
   */
  collateralValueBefore: number;
  /**
   * Total debt value before the shock (in USD).
   */
  debtValueBefore: number;
  /**
   * Health factor before the shock.
   */
  healthFactorBefore: number;
  /**
   * Total collateral value after applying the price shock.
   */
  collateralValueAfter: number;
  /**
   * Total debt value after the shock.
   */
  debtValueAfter: number;
  /**
   * Health factor after applying the price shock.
   */
  healthFactorAfter: number;
  /**
   * Whether this position became liquidatable after the shock.
   */
  liquidatable: boolean;
}

export interface LiquidationStep {
  positionId: string;
  protocol: ProtocolId;
  /**
   * Fraction of the position that was liquidated in this step (0–1).
   */
  closeFactorApplied: number;
  /**
   * Debt repaid in this step (USD).
   */
  debtRepaidUsd: number;
  /**
   * Collateral seized by the liquidator (USD, pre-bonus).
   */
  collateralSeizedUsd: number;
  /**
   * Liquidation bonus amount on top of collateral seized (USD).
   */
  liquidationBonusUsd: number;
  /**
   * Resulting bad debt after this step (USD, if any).
   */
  badDebtUsd: number;
}

export interface PositionLiquidationSummary {
  positionId: string;
  protocol: ProtocolId;
  account: string;
  /**
   * Aggregate bad debt for this position after all liquidation steps.
   */
  totalBadDebtUsd: number;
  /**
   * Aggregate collateral deficit for this position (if collateral was insufficient).
   */
  collateralDeficitUsd: number;
  /**
   * Liquidation steps executed for this position, in order.
   */
  steps: LiquidationStep[];
}

export interface ProtocolSimulationResult {
  protocol: ProtocolId;
  positions: PositionHealthSnapshot[];
  liquidations: PositionLiquidationSummary[];
  /**
   * Total bad debt across all positions in this protocol.
   */
  totalBadDebtUsd: number;
  /**
   * Total collateral deficit across all positions in this protocol.
   */
  totalCollateralDeficitUsd: number;
}

export interface InsolvencyThresholdEstimate {
  /**
   * Approximate minimum shock percentage that leads to protocol insolvency.
   */
  shockPercentage: number;
  /**
   * Total bad debt at this threshold shock.
   */
  badDebtUsd: number;
}

export interface RiskSimulationResult {
  /**
   * Input configuration used for this simulation.
   */
  config: RiskSimulationConfig;
  /**
   * Asset prices before and after the shock (in USD).
   */
  prices: {
    before: AssetPriceMap;
    after: AssetPriceMap;
  };
  /**
   * Per-protocol simulation details.
   */
  protocols: ProtocolSimulationResult[];
  /**
   * Global totals across all protocols.
   */
  totals: {
    totalBadDebtUsd: number;
    totalCollateralDeficitUsd: number;
  };
  /**
   * Optional insolvency threshold estimates per protocol.
   */
  insolvencyThresholds: Partial<Record<ProtocolId, InsolvencyThresholdEstimate>>;
}

