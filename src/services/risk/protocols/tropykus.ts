import {
  AssetSymbol,
  BorrowPosition,
  LiquidationParameters,
  ProtocolId,
  ProtocolRiskConfig,
} from "../types.js";

export const TROPYKUS_PROTOCOL_ID: ProtocolId = "tropykus-v2";

/**
 * Default Tropykus v2 liquidation parameters.
 * These are approximate defaults and should be adjusted to match actual
 * protocol settings when wired to live data.
 */
export const DEFAULT_TROPYKUS_LIQUIDATION_PARAMS: LiquidationParameters = {
  maxLtv: 0.65,
  liquidationThreshold: 0.75,
  closeFactor: 0.5,
  liquidationBonus: 0.05,
};

export const TROPYKUS_RISK_CONFIG: ProtocolRiskConfig = {
  id: TROPYKUS_PROTOCOL_ID,
  liquidation: DEFAULT_TROPYKUS_LIQUIDATION_PARAMS,
};

export interface TropykusPosition extends BorrowPosition {
  protocol: typeof TROPYKUS_PROTOCOL_ID;
}

/**
 * Placeholder for Tropykus v2 position fetching via on-chain or indexer data.
 * This function can be expanded without changing the engine interface.
 */
export async function fetchTropykusPositions(): Promise<TropykusPosition[]> {
  // TODO: integrate with Tropykus indexer / contracts.
  return [];
}

export const TROPYKUS_SUPPORTED_ASSETS: AssetSymbol[] = ["rbtc", "rif", "dllr"];

