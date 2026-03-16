import {
  AssetSymbol,
  BorrowPosition,
  LiquidationParameters,
  ProtocolId,
  ProtocolRiskConfig,
} from "../types.js";

export const SOVRYN_PROTOCOL_ID: ProtocolId = "sovryn-v1";

/**
 * Default Sovryn v1 liquidation parameters.
 * These values are approximate and should be refined against
 * the live protocol configuration when integrating with production data.
 */
export const DEFAULT_SOVRYN_LIQUIDATION_PARAMS: LiquidationParameters = {
  maxLtv: 0.7,
  liquidationThreshold: 0.8,
  closeFactor: 0.5,
  liquidationBonus: 0.08,
};

export const SOVRYN_RISK_CONFIG: ProtocolRiskConfig = {
  id: SOVRYN_PROTOCOL_ID,
  liquidation: DEFAULT_SOVRYN_LIQUIDATION_PARAMS,
};

export interface SovrynPosition extends BorrowPosition {
  protocol: typeof SOVRYN_PROTOCOL_ID;
}

/**
 * Placeholder for Sovryn v1 position fetching via on-chain or indexer data.
 * This function can be expanded to query real positions while keeping the
 * engine API stable.
 */
export async function fetchSovrynPositions(): Promise<SovrynPosition[]> {
  // TODO: integrate with Sovryn indexer / contracts.
  return [];
}

export const SOVRYN_SUPPORTED_ASSETS: AssetSymbol[] = ["rbtc", "rif", "dllr"];

