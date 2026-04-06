import { AssetPriceMap, AssetSymbol, BorrowPosition, ProtocolId } from "./types.js";

/**
 * Mapping from internal asset symbols to CoinGecko IDs.
 * These IDs can be adjusted as we refine asset coverage.
 */
const COINGECKO_IDS: Record<AssetSymbol, string> = {
  // Rootstock BTC
  rbtc: "rootstock", // Placeholder; align with actual CoinGecko ID for RBTC if different
  // RIF token
  rif: "rif-token",
  // Dollar on Chain / DLLR
  dllr: "dllr",
  // Sovryn governance token
  sov: "sovryn",
  // Synthetic USD (we treat this as 1 USD using CoinGecko's usd price)
  usd: "usd",
};

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

// Sovryn v1 subgraph / indexer endpoint.
// NOTE: The base URL MUST NOT include a trailing `/graphql` when used
// with POST { query } bodies, otherwise the subgraph name is invalid.
// Can be overridden via SOVRYN_SUBGRAPH_URL environment variable if needed.
export const SOVRYN_SUBGRAPH_URL =
  process.env.SOVRYN_SUBGRAPH_URL ||
  "https://subgraph.sovryn.app/subgraphs/name/DistributedCollective/sovryn-subgraph";

// TODO: Replace this placeholder with the actual Tropykus v2 subgraph / indexer endpoint when available.
export const TROPYKUS_SUBGRAPH_URL =
  process.env.TROPYKUS_SUBGRAPH_URL || "https://TROPYKUS_SUBGRAPH_URL_TODO";

export interface PriceFetchOptions {
  vsCurrency?: string;
  assets?: AssetSymbol[];
}

export async function fetchAssetPrices(
  options: PriceFetchOptions = {}
): Promise<AssetPriceMap> {
  const vsCurrency = options.vsCurrency ?? "usd";
  const assets: AssetSymbol[] = options.assets ?? (Object.keys(COINGECKO_IDS) as AssetSymbol[]);

  const ids = assets
    .map((symbol) => COINGECKO_IDS[symbol])
    .filter(Boolean)
    .join(",");

  if (!ids) {
    return {};
  }

  const url = `${COINGECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(
    ids
  )}&vs_currencies=${encodeURIComponent(vsCurrency)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch prices from CoinGecko: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, Record<string, number>>;

  const priceMap: AssetPriceMap = {};

  for (const symbol of assets) {
    const id = COINGECKO_IDS[symbol];
    const entry = data[id];
    if (entry && typeof entry[vsCurrency] === "number") {
      priceMap[symbol] = entry[vsCurrency];
    }
  }

  return priceMap;
}

export interface PositionFetchOptions {
  /**
   * Optional hint to use testnet endpoints or mocks.
   */
  testnet?: boolean;
}

interface RawPosition {
  id: string;
  borrower: string;
  collateralAsset: string;
  collateralAmount: string;
  borrowAsset: string;
  borrowAmount: string;
  liquidationThreshold?: string | number | null;
}

async function fetchJson<T>(url: string, query: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Map protocol-specific token symbols to our internal AssetSymbol set.
// This avoids mis-pricing Sovryn tokens as RBTC.
const SYMBOL_TO_ASSET: Record<string, AssetSymbol> = {
  // Rootstock BTC variants
  rbtc: "rbtc",
  wrbtc: "rbtc",

  // Sovryn governance token
  sov: "sov",

  // Stablecoins treated as USD
  xusd: "usd",
  doc: "usd",

  // DLLR
  dllr: "dllr",

  // RIF
  rif: "rif",
};

function resolveAssetSymbol(symbol: string): AssetSymbol {
  const lower = symbol.toLowerCase();
  if (SYMBOL_TO_ASSET[lower]) {
    return SYMBOL_TO_ASSET[lower];
  }

  // Fallback: treat unknown tokens as USD to avoid extreme mispricing,
  // rather than defaulting to RBTC.
  return "usd";
}

function mapRawPositionsToBorrowPositions(
  rawPositions: RawPosition[],
  protocol: ProtocolId
): BorrowPosition[] {
  return rawPositions.map((p) => {
    const collateralAsset = resolveAssetSymbol(p.collateralAsset);
    const debtAsset = resolveAssetSymbol(p.borrowAsset);

    const collateralAmount = Number(p.collateralAmount) || 0;
    const debtAmount = Number(p.borrowAmount) || 0;

    return {
      id: p.id,
      protocol,
      account: p.borrower,
      collateral: [
        {
          asset: collateralAsset,
          amount: collateralAmount,
        },
      ],
      debt: [
        {
          asset: debtAsset,
          amount: debtAmount,
        },
      ],
    };
  });
}

async function fetchSovrynBorrowerPositions(
  options: PositionFetchOptions
): Promise<BorrowPosition[]> {
  void options;

  // Exact query confirmed working in Sovryn GraphiQL UI.
  const query = `
    query SovrynLoans {
      loans(first: 1000) {
        id
        borrowedAmount
        positionSize
        user {
          id
        }
        loanToken {
          symbol
        }
        collateralToken {
          symbol
        }
      }
    }
  `;

  type SovrynLoan = {
    id: string;
    borrowedAmount?: string | null;
    positionSize?: string | null;
    user?: {
      id: string;
    } | null;
    loanToken?: {
      symbol: string;
    } | null;
    collateralToken?: {
      symbol: string;
    } | null;
  };

  try {
    // Use a direct POST with a { query } JSON body, matching typical GraphQL usage.
    const httpResponse = await fetch(SOVRYN_SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const text = await httpResponse.text();

    if (!httpResponse.ok) {
      console.warn(
        "[risk][dataSources] Sovryn loans HTTP error:",
        httpResponse.status,
        httpResponse.statusText,
        "- body:",
        text.slice(0, 300)
      );
      return [];
    }

    let json: {
      data?: { loans?: SovrynLoan[] };
      errors?: Array<{ message: string }>;
    };

    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.warn(
        "[risk][dataSources] Sovryn loans response was not valid JSON. First 300 chars:",
        text.slice(0, 300)
      );
      return [];
    }

    if (json.errors && json.errors.length > 0) {
      console.warn(
        "[risk][dataSources] Sovryn loans query returned GraphQL errors:",
        json.errors.map((e) => e.message).join(", ")
      );
      return [];
    }

    const loans = json.data?.loans ?? [];

    const rawPositions: RawPosition[] = loans
      .filter(
        (loan) =>
          loan.borrowedAmount &&
          loan.positionSize &&
          loan.user &&
          loan.loanToken &&
          loan.collateralToken
      )
      .map((loan) => ({
        id: loan.id,
        borrower: loan.user!.id,
        collateralAsset: loan.collateralToken!.symbol,
        collateralAmount: loan.positionSize as string,
        borrowAsset: loan.loanToken!.symbol,
        borrowAmount: loan.borrowedAmount as string,
        liquidationThreshold: null,
      }));

    return mapRawPositionsToBorrowPositions(rawPositions, "sovryn-v1");
  } catch (error: any) {
    console.warn(
      "[risk][dataSources] Failed to fetch Sovryn borrower positions:",
      error?.message || String(error)
    );
    return [];
  }
}

async function fetchTropykusBorrowerPositions(
  options: PositionFetchOptions
): Promise<BorrowPosition[]> {
  // Tropykus integration is currently disabled. We return an empty
  // array without logging to avoid noisy output in the CLI.
  void options;
  return [];
}

/**
 * Fetch borrower positions for a given protocol.
 *
 * NOTE: This is an abstraction point. Initial implementation can use
 * placeholder or mocked data, and later be replaced by real on-chain
 * or indexer-backed queries without affecting the engine.
 */
export async function fetchBorrowerPositions(
  protocol: ProtocolId,
  options: PositionFetchOptions = {}
): Promise<BorrowPosition[]> {
  switch (protocol) {
    case "sovryn-v1":
      return fetchSovrynBorrowerPositions(options);
    case "tropykus-v2":
      return fetchTropykusBorrowerPositions(options);
    default:
      return [];
  }
}

