import { AssetPriceMap, AssetSymbol, BorrowPosition, ProtocolId } from "./types.js";
import { logWarning } from "../../utils/logger.js";

const COINGECKO_IDS: Partial<Record<AssetSymbol, string>> = {
  rbtc: "rootstock",
  rif: "rif-token",
  dllr: "dllr",
  sov: "sovryn",
};

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

export const SOVRYN_SUBGRAPH_URL =
  process.env.SOVRYN_SUBGRAPH_URL ||
  "https://subgraph.sovryn.app/subgraphs/name/DistributedCollective/sovryn-subgraph";

export const TROPYKUS_SUBGRAPH_URL =
  process.env.TROPYKUS_SUBGRAPH_URL || "https://TROPYKUS_SUBGRAPH_URL_TODO";

export interface PriceFetchOptions {
  vsCurrency?: string;
  assets?: AssetSymbol[];
  timeoutMs?: number;
  isExternal?: boolean;
}

export async function fetchAssetPrices(
  options: PriceFetchOptions = {}
): Promise<AssetPriceMap> {
  const vsCurrency = options.vsCurrency ?? "usd";
  const assets: AssetSymbol[] =
    options.assets ?? (Object.keys(COINGECKO_IDS) as AssetSymbol[]);
  const timeoutMs = options.timeoutMs ?? 30000;
  const isExternal = options.isExternal ?? false;

  const ids = assets
    .map((symbol) => COINGECKO_IDS[symbol])
    .filter((v): v is string => typeof v === "string")
    .join(",");

  const priceMap: AssetPriceMap = { usd: 1 };
  if (!ids) return priceMap;

  const url = `${COINGECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(
    ids
  )}&vs_currencies=${encodeURIComponent(vsCurrency)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch prices from CoinGecko: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as Record<string, Record<string, number>>;

  for (const symbol of assets) {
    const id = COINGECKO_IDS[symbol];
    if (!id) {
      logWarning(isExternal, `Unpriced asset symbol: ${symbol}`);
      continue;
    }
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
  timeoutMs?: number;
  isExternal?: boolean;
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

async function fetchGraphQL<T>(params: {
  url: string;
  query: string;
  variables?: Record<string, any>;
  timeoutMs: number;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(params.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: params.query, variables: params.variables }),
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

const SYMBOL_TO_ASSET: Record<string, AssetSymbol> = {
  rbtc: "rbtc",
  wrbtc: "rbtc",
  sov: "sov",
  xusd: "usd",
  doc: "usd",
  dllr: "dllr",
  rif: "rif",
};

function resolveAssetSymbol(symbol: string): AssetSymbol {
  const lower = symbol.toLowerCase();
  if (SYMBOL_TO_ASSET[lower]) {
    return SYMBOL_TO_ASSET[lower];
  }
  return "usd";
}

const TOKEN_DECIMALS_BY_SYMBOL: Record<string, number> = {
  wrbtc: 18,
  rbtc: 18,
  sov: 18,
  xusd: 18,
  doc: 18,
  dllr: 18,
  rif: 18,
};

function parseTokenAmount(params: { raw: string; decimals: number }): number {
  const s = String(params.raw ?? "").trim();
  if (!s) return 0;

  if (s.includes(".")) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  if (!/^\d+$/.test(s)) return 0;

  const decimals = Math.max(0, Math.min(36, params.decimals));
  const base = 10n ** BigInt(decimals);
  const bi = BigInt(s);
  const whole = Number(bi / base);
  const frac = Number(bi % base) / Number(base);
  const out = whole + frac;
  return Number.isFinite(out) ? out : 0;
}

function mapRawPositionsToBorrowPositions(
  rawPositions: RawPosition[],
  protocol: ProtocolId
): BorrowPosition[] {
  return rawPositions.map((p) => {
    const collateralAsset = resolveAssetSymbol(p.collateralAsset);
    const debtAsset = resolveAssetSymbol(p.borrowAsset);

    const collateralDecimals =
      TOKEN_DECIMALS_BY_SYMBOL[p.collateralAsset.toLowerCase()] ?? 18;
    const debtDecimals =
      TOKEN_DECIMALS_BY_SYMBOL[p.borrowAsset.toLowerCase()] ?? 18;

    const collateralAmount = parseTokenAmount({
      raw: p.collateralAmount,
      decimals: collateralDecimals,
    });
    const debtAmount = parseTokenAmount({
      raw: p.borrowAmount,
      decimals: debtDecimals,
    });

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
  const timeoutMs = options.timeoutMs ?? 30000;
  const isExternal = options.isExternal ?? false;

  const query = `
    query SovrynLoans($lastId: ID) {
      loans(
        first: 1000,
        orderBy: id,
        orderDirection: asc,
        where: { id_gt: $lastId }
      ) {
        id
        borrowedAmount
        positionSize
        user { id }
        loanToken { symbol }
        collateralToken { symbol }
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
    const allLoans: SovrynLoan[] = [];
    let lastId: string | null = "";

    type SovrynLoansResponse = {
      data?: { loans?: SovrynLoan[] };
      errors?: Array<{ message: string }>;
    };

    for (let page = 0; page < 50; page++) {
      const resp: SovrynLoansResponse = await fetchGraphQL<SovrynLoansResponse>({
        url: SOVRYN_SUBGRAPH_URL,
        query,
        variables: { lastId },
        timeoutMs,
      });

      if (resp.errors && resp.errors.length > 0) {
        logWarning(
          isExternal,
          `Sovryn subgraph GraphQL errors: ${resp.errors
            .map((e: { message: string }) => e.message)
            .join(", ")}`
        );
        return [];
      }

      const loans: SovrynLoan[] = resp.data?.loans ?? [];
      if (loans.length === 0) break;

      allLoans.push(...loans);
      lastId = loans[loans.length - 1]?.id ?? lastId;
      if (loans.length < 1000) break;
    }

    const rawPositions: RawPosition[] = allLoans
      .filter(
        (loan) =>
          loan.user?.id &&
          loan.loanToken?.symbol &&
          loan.collateralToken?.symbol &&
          loan.borrowedAmount != null &&
          loan.positionSize != null
      )
      .map((loan) => ({
        id: loan.id,
        borrower: loan.user!.id,
        collateralAsset: loan.collateralToken!.symbol,
        collateralAmount: String(loan.positionSize ?? ""),
        borrowAsset: loan.loanToken!.symbol,
        borrowAmount: String(loan.borrowedAmount ?? ""),
        liquidationThreshold: null,
      }));

    return mapRawPositionsToBorrowPositions(rawPositions, "sovryn-v1");
  } catch (error: any) {
    logWarning(
      isExternal,
      `Failed to fetch Sovryn borrower positions: ${error?.message || String(error)}`
    );
    return [];
  }
}

async function fetchTropykusBorrowerPositions(
  options: PositionFetchOptions
): Promise<BorrowPosition[]> {
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

