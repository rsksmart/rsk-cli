import chalk from "chalk";
import inquirer from "inquirer";
import ViemProvider from "../utils/viemProvider.js";
import { getConfig } from "./config.js";
import { logError, logInfo, logSuccess } from "../utils/logger.js";
import { createSpinner, type SpinnerWrapper } from "../utils/spinner.js";
import { WalletData } from "../utils/types.js";
import crypto from "crypto";
import { Flyover, FlyoverUtils } from "@rsksmart/flyover-sdk";
import { BlockchainConnection, BlockchainReadOnlyConnection, ethers } from "@rsksmart/bridges-core-sdk";
import { formatUnits, parseUnits } from "viem";

type SwapMode = "liquidity" | "pegin" | "pegout";

export type SwapCommandOptions = {
  testnet?: boolean;

  // MCP / external mode handling
  isExternal?: boolean;
  walletsData?: WalletData;
  password?: string;
  walletName?: string;

  // Trusted accounts (captcha bypass)
  trustedWalletName?: string;
  trustedPrivateKey?: string;

  // Operation selection
  liquidity?: boolean;
  pegin?: boolean;
  pegout?: boolean;
  interactive?: boolean;

  // Inputs (will be validated as needed in the real implementation)
  amount?: number;
  btcAddress?: string;
  provider?: string;
};

export type SwapResult = {
  success: boolean;
  data?: {
    mode: SwapMode;
    liquidityProviders?: Array<{
      operation?: SwapMode;
      providerName?: string;
      minAmount?: string;
      maxAmount?: string;
      feeEstimate?: string;
      confirmationsRequired?: number;
      quoteExpiresAt?: string;
    }>;
    quoteExpiresAt?: string;
    quoteId?: string;
    totalFeeEstimate?: string;
    callFeeEstimate?: string;
    gasFeeEstimate?: string;
    depositAddress?: string;
    btcDestinationAddress?: string;
    txHash?: string;
  };
  error?: string;
};

function getRskRpcUrl(isTestnet: boolean): string {
  // Keep aligned with wallet signer defaults used elsewhere in this repo.
  return isTestnet
    ? "https://public-node.testnet.rsk.co"
    : "https://public-node.rsk.co";
}

function getFlyoverNetwork(isTestnet: boolean): "Mainnet" | "Testnet" {
  return isTestnet ? "Testnet" : "Mainnet";
}

function toIsoDate(unixOrMs: number): string {
  // Some Flyover SDK timestamps come back in seconds, others in ms.
  const ms = unixOrMs > 1_000_000_000_000 ? unixOrMs : unixOrMs * 1000;
  return new Date(ms).toISOString();
}

async function createFlyoverReadOnly(isTestnet: boolean): Promise<Flyover> {
  const rpcUrl = getRskRpcUrl(isTestnet);
  const rskConnection = await BlockchainReadOnlyConnection.createUsingRpc(rpcUrl);
  const captchaTokenResolver = async () => process.env.FLYOVER_CAPTCHA_TOKEN || "";

  return new Flyover({
    network: getFlyoverNetwork(isTestnet),
    rskConnection,
    captchaTokenResolver,
    allowInsecureConnections: false,
  });
}

async function decryptWalletPrivateKeyFromWalletItem(
  walletItem: { encryptedPrivateKey: string; iv: string },
  password: string
): Promise<string> {
  if (!walletItem?.encryptedPrivateKey || !walletItem?.iv) {
    throw new Error("Invalid wallet data: missing encryption information");
  }

  try {
    const decipherIv = Uint8Array.from(Buffer.from(walletItem.iv, "hex"));
    const key = crypto.scryptSync(password, decipherIv, 32);
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Uint8Array.from(key),
      decipherIv
    );

    let decryptedPrivateKey = decipher.update(
      walletItem.encryptedPrivateKey,
      "hex",
      "utf8"
    );
    decryptedPrivateKey += decipher.final("utf8");

    return decryptedPrivateKey.startsWith("0x")
      ? decryptedPrivateKey
      : `0x${decryptedPrivateKey}`;
  } catch (e) {
    throw new Error("Failed to decrypt wallet private key. Please check your password.");
  }
}

async function createBlockchainConnectionFromWallet(params: {
  testnet: boolean;
  isExternal: boolean;
  walletName?: string;
  walletsData?: WalletData;
  password?: string;
  spinner?: SpinnerWrapper;
}): Promise<{ rskAddress: string; connection: BlockchainConnection; resolvedWalletName: string }> {
  const isTestnet = params.testnet;
  const rpcUrl = getRskRpcUrl(isTestnet);

  if (params.isExternal) {
    if (!params.walletsData || !params.walletName || !params.password) {
      throw new Error("In external mode, walletName, password and walletsData are required.");
    }

    const wallet = params.walletsData.wallets[params.walletName];
    if (!wallet) {
      throw new Error("Wallet with the provided name does not exist.");
    }

    const privateKey = await decryptWalletPrivateKeyFromWalletItem(wallet, params.password);

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const walletObj = new ethers.Wallet(privateKey, provider);
    const encryptedJson = await walletObj.encrypt(params.password);

    // bridges-core-sdk expects an "encrypted json" object and then does JSON.stringify internally.
    // ethers v5 returns `wallet.encrypt()` as a string, so we must parse it first.
    const encryptedJsonObj =
      typeof encryptedJson === "string" ? JSON.parse(encryptedJson) : encryptedJson;

    const connection = await BlockchainConnection.createUsingEncryptedJson(
      encryptedJsonObj,
      params.password,
      rpcUrl
    );
    return {
      rskAddress: toFlyoverRskAddress(wallet.address, isTestnet),
      connection,
      resolvedWalletName: params.walletName!,
    };
  }

  // Internal mode: prompt for password through ViemProvider, then decrypt privately to build a keystore.
  const viemProvider = new ViemProvider(isTestnet);

  // Stop spinner before prompting password (otherwise it looks stuck).
  params.spinner?.stop();

  const { password, data: walletsData, name: resolvedWalletName } =
    await viemProvider.getWalletClientWithPassword(params.walletName);

  const wallet = walletsData.wallets[resolvedWalletName];
  if (!wallet) {
    throw new Error("No valid wallet found in local wallet data.");
  }

  const privateKey = await decryptWalletPrivateKeyFromWalletItem(wallet, password);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const walletObj = new ethers.Wallet(privateKey, provider);
  const encryptedJson = await walletObj.encrypt(password);

  const encryptedJsonObj =
    typeof encryptedJson === "string" ? JSON.parse(encryptedJson) : encryptedJson;

  const connection = await BlockchainConnection.createUsingEncryptedJson(
    encryptedJsonObj,
    password,
    rpcUrl
  );
  return {
    rskAddress: toFlyoverRskAddress(wallet.address, isTestnet),
    connection,
    resolvedWalletName,
  };
}

async function createBlockchainConnectionFromPrivateKey(params: {
  testnet: boolean;
  privateKey: string;
}): Promise<{ rskAddress: string; connection: BlockchainConnection }> {
  const isTestnet = params.testnet;
  const rpcUrl = getRskRpcUrl(isTestnet);
  const privateKey = params.privateKey.trim().startsWith("0x")
    ? params.privateKey.trim()
    : `0x${params.privateKey.trim()}`;

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const walletObj = new ethers.Wallet(privateKey, provider);

  // bridges-core-sdk expects encrypted JSON + password.
  // We'll generate a throwaway password since we already have the raw private key.
  const tempPassword = crypto.randomBytes(16).toString("hex");
  const encryptedJson = await walletObj.encrypt(tempPassword);
  const encryptedJsonObj =
    typeof encryptedJson === "string" ? JSON.parse(encryptedJson) : encryptedJson;

  const connection = await BlockchainConnection.createUsingEncryptedJson(
    encryptedJsonObj,
    tempPassword,
    rpcUrl
  );

  return {
    rskAddress: toFlyoverRskAddress(walletObj.address, isTestnet),
    connection,
  };
}

function formatRbtc(wei: bigint): string {
  return formatUnits(wei, 18);
}

function toFlyoverRskAddress(address: string, isTestnet: boolean): string {
  const chainId = isTestnet ? 31 : 30;
  // Flyover SDK validates checksum, so we must provide a checksummed address.
  return FlyoverUtils.rskChecksum(address, chainId);
}

function normalizeWalletLabel(name?: string): string {
  return String(name || "").trim().toLowerCase();
}

function rethrowIfTrustedAccountRejected(error: unknown): never {
  const msg = error instanceof Error ? error.message : String(error);
  if (/trusted account/i.test(msg) || /fetching trusted/i.test(msg)) {
    throw new Error(
      "The liquidity provider rejected authenticated (trusted) quote acceptance. " +
        "Your Rootstock address must be allowlisted on that LP, or use a valid captcha token (set FLYOVER_CAPTCHA_TOKEN) and run without --trusted-wallet. " +
        "Ask the LP operator to add your address to trusted accounts on their LPS."
    );
  }
  throw error instanceof Error ? error : new Error(msg);
}

async function resolveCaptchaToken(params: {
  isExternal: boolean;
  providerName?: string;
  providerApiBaseUrl?: string;
  providerSiteKey?: string;
  spinner?: SpinnerWrapper;
}): Promise<string> {
  const fromEnv = (process.env.FLYOVER_CAPTCHA_TOKEN || "").trim();
  if (fromEnv) return fromEnv;

  if (params.isExternal) {
    throw new Error(
      "FLYOVER_CAPTCHA_TOKEN env var is required in external (MCP) mode when the selected LP requires captcha."
    );
  }

  // Stop spinner before prompting, otherwise inquirer prompt can look "stuck" on some terminals.
  params.spinner?.stop();

  const { token } = await inquirer.prompt<{ token: string }>([
    {
      type: "input",
      name: "token",
      message:
        `Enter Flyover captcha token (X-Captcha-Token) required by the selected LP${
          params.providerName ? `: ${params.providerName}` : ""
        }${params.providerSiteKey ? ` (siteKey: ${params.providerSiteKey})` : ""}`,
      validate: (v) => (String(v || "").trim().length > 0 ? true : "Token is required"),
    },
  ]);

  return String(token).trim();
}

async function getLiquidityProviders(_params: {
  isTestnet: boolean;
}): Promise<NonNullable<SwapResult["data"]>["liquidityProviders"]> {
  const flyover = await createFlyoverReadOnly(_params.isTestnet);
  const providers = await flyover.getLiquidityProviders();

  const quoteExpiresAt = new Date(Date.now() + 60_000).toISOString();
  const liquidityProviders: NonNullable<SwapResult["data"]>["liquidityProviders"] = [];

  for (const provider of providers as any[]) {
    const providerName: string = provider.name ?? "Unknown LP";

    if (provider?.pegin) {
      liquidityProviders.push({
        operation: "pegin",
        providerName,
        minAmount: formatRbtc(provider.pegin.minTransactionValue),
        maxAmount: formatRbtc(provider.pegin.maxTransactionValue),
        feeEstimate: formatRbtc(provider.pegin.fee),
        confirmationsRequired: provider.pegin.requiredConfirmations,
        quoteExpiresAt,
      });
    }

    if (provider?.pegout) {
      liquidityProviders.push({
        operation: "pegout",
        providerName,
        minAmount: formatRbtc(provider.pegout.minTransactionValue),
        maxAmount: formatRbtc(provider.pegout.maxTransactionValue),
        feeEstimate: formatRbtc(provider.pegout.fee),
        confirmationsRequired: provider.pegout.requiredConfirmations,
        quoteExpiresAt,
      });
    }
  }

  return liquidityProviders;
}

function normalizeProviderSelector(input?: string): string {
  return String(input || "").trim().toLowerCase();
}

function formatProviderLabel(provider: any): string {
  return `${provider?.name ?? "Unknown"} (${provider?.apiBaseUrl ?? "no apiBaseUrl"})`;
}

function selectProvider(params: {
  providers: any[];
  providerSelector?: string;
  operationLabel: "peg-in" | "peg-out";
}): any {
  const { providers, providerSelector, operationLabel } = params;
  if (!providers || providers.length === 0) {
    throw new Error(`No liquidity providers available for ${operationLabel}.`);
  }

  const selector = normalizeProviderSelector(providerSelector);
  if (selector) {
    const matched = providers.find((p) => {
      const name = normalizeProviderSelector(p?.name);
      const apiBaseUrl = normalizeProviderSelector(p?.apiBaseUrl);
      return name === selector || apiBaseUrl === selector;
    });

    if (!matched) {
      const available = providers.map(formatProviderLabel).join(", ");
      throw new Error(
        `Requested provider "${providerSelector}" is not available for ${operationLabel}. Available providers: ${available}`
      );
    }
    return matched;
  }

  // Default behavior: prefer LPs that do not require captcha.
  return providers.find((p) => !p?.siteKey) ?? providers[0];
}

async function createTrustedFlyoverSigner(params: {
  isTestnet: boolean;
  isExternal: boolean;
  trustedWalletName?: string;
  trustedPrivateKey?: string;
  walletsData?: WalletData;
  password?: string;
  spinner?: SpinnerWrapper;
  /** When the trusted wallet is the same as the signing wallet, reuse this connection (one password prompt). */
  reuseSigner?: { rskAddress: string; connection: BlockchainConnection };
}): Promise<{ trustedAddress: string; trustedFlyover: Flyover } | null> {
  const trustedWalletName = (params.trustedWalletName || "").trim();
  const trustedPrivateKey = (params.trustedPrivateKey || "").trim();

  if (!trustedWalletName && !trustedPrivateKey) return null;

  if (trustedWalletName && trustedPrivateKey) {
    throw new Error("Please provide only one of trustedWalletName or trustedPrivateKey.");
  }

  let rskAddress: string;
  let connection: BlockchainConnection;

  if (trustedPrivateKey) {
    const created = await createBlockchainConnectionFromPrivateKey({
      testnet: params.isTestnet,
      privateKey: trustedPrivateKey,
    });
    rskAddress = created.rskAddress;
    connection = created.connection;
  } else if (params.reuseSigner && trustedWalletName) {
    rskAddress = params.reuseSigner.rskAddress;
    connection = params.reuseSigner.connection;
  } else if (trustedWalletName) {
    const created = await createBlockchainConnectionFromWallet({
      testnet: params.isTestnet,
      isExternal: params.isExternal,
      walletName: trustedWalletName,
      walletsData: params.walletsData,
      password: params.password,
      spinner: params.spinner,
    });
    rskAddress = created.rskAddress;
    connection = created.connection;
  } else {
    return null;
  }

  const trustedFlyover = new Flyover({
    network: getFlyoverNetwork(params.isTestnet),
    rskConnection: connection,
    // Not used in authenticated acceptance flow, but required by constructor.
    captchaTokenResolver: async () => "",
    allowInsecureConnections: false,
  });

  return { trustedAddress: rskAddress, trustedFlyover };
}

async function handlePegIn(_params: {
  isTestnet: boolean;
  amount: number;
  isExternal: boolean;
  walletName?: string;
  walletsData?: WalletData;
  password?: string;
  spinner?: SpinnerWrapper;
  provider?: string;
  trustedWalletName?: string;
  trustedPrivateKey?: string;
}): Promise<Pick<
  NonNullable<SwapResult["data"]>,
  "txHash" | "totalFeeEstimate" | "quoteExpiresAt" | "depositAddress"
  | "quoteId"
  | "callFeeEstimate"
  | "gasFeeEstimate"
>> {
  const { isTestnet, amount, isExternal, walletName, walletsData, password, spinner, provider } =
    _params;
  const amountWei = parseUnits(amount.toString(), 18);

  const { rskAddress, connection, resolvedWalletName } = await createBlockchainConnectionFromWallet({
    testnet: isTestnet,
    isExternal,
    walletName,
    walletsData,
    password,
    spinner,
  });

  const reuseTrustedConnection =
    !_params.trustedPrivateKey &&
    !!_params.trustedWalletName?.trim() &&
    normalizeWalletLabel(_params.trustedWalletName) === normalizeWalletLabel(resolvedWalletName);

  let selectedProvider: any;
  const captchaTokenResolver = async () =>
    resolveCaptchaToken({
      isExternal,
      spinner,
      providerName: selectedProvider?.name,
      providerApiBaseUrl: selectedProvider?.apiBaseUrl,
      providerSiteKey: selectedProvider?.siteKey,
    });
  const flyover = new Flyover({
    network: getFlyoverNetwork(isTestnet),
    rskConnection: connection,
    captchaTokenResolver,
    allowInsecureConnections: false,
  });

  const providers = await flyover.getLiquidityProviders();
  const peginProviders = (providers as any[]).filter((p) => p?.pegin);
  selectedProvider = selectProvider({
    providers: peginProviders,
    providerSelector: provider,
    operationLabel: "peg-in",
  });

  logInfo(
    isExternal,
    `🧩 Selected LP: ${selectedProvider.name ?? "Unknown"} (${selectedProvider.apiBaseUrl ?? "no apiBaseUrl"})`
  );
  logInfo(isExternal, `🔑 LP siteKey: ${selectedProvider.siteKey ?? "no siteKey"}`);

  flyover.useLiquidityProvider(selectedProvider);

  const quoteRequest = {
    callEoaOrContractAddress: rskAddress,
    // Flyover treats this as hex-encoded call data. Use empty bytes ("0x") to avoid odd-length errors.
    callContractArguments: "0x",
    rskRefundAddress: rskAddress,
    valueToTransfer: amountWei,
  };

  const quotes = await flyover.getQuotes(quoteRequest as any);
  if (!quotes || quotes.length === 0) {
    throw new Error("No peg-in quotes available for the provided amount.");
  }

  const quote = quotes[0] as any;

  if (!FlyoverUtils.isPeginStillPayable(quote)) {
    throw new Error("Quote expired. Please request a new peg-in quote.");
  }

  const quoteExpiresAtMs =
    (quote.quote.agreementTimestamp > 1_000_000_000_000
      ? quote.quote.agreementTimestamp
      : quote.quote.agreementTimestamp * 1000) +
    Number(quote.quote.timeForDeposit) * 1000;
  const quoteExpiresAt = new Date(quoteExpiresAtMs).toISOString();

  const totalFeeEstimateWei = FlyoverUtils.getQuoteTotal(quote);

  logInfo(isExternal, `📄 Peg-in quote id: ${quote.quoteHash}`);
  logInfo(
    isExternal,
    `💱 Fee estimate: call=${formatRbtc(quote.quote.callFee)} RBTC, gas=${formatRbtc(quote.quote.gasFee)} RBTC, total=${formatRbtc(totalFeeEstimateWei)} RBTC`
  );
  logInfo(isExternal, `⛽ Required confirmations: ${quote.quote.confirmations}`);
  logInfo(isExternal, `⏳ Quote expires at: ${quoteExpiresAt}`);

  const trusted = await createTrustedFlyoverSigner({
    isTestnet,
    isExternal,
    trustedWalletName: _params.trustedWalletName,
    trustedPrivateKey: _params.trustedPrivateKey,
    walletsData,
    password,
    spinner,
    reuseSigner: reuseTrustedConnection ? { rskAddress, connection } : undefined,
  });

  let accepted: any;
  if (trusted) {
    trusted.trustedFlyover.useLiquidityProvider(selectedProvider);
    const signature = await (trusted.trustedFlyover as any).signQuote(quote);
    logInfo(isExternal, `🔐 Using trusted account to accept quote: ${trusted.trustedAddress}`);
    try {
      accepted = await (flyover as any).acceptAuthenticatedQuote(quote, signature);
    } catch (e) {
      rethrowIfTrustedAccountRejected(e);
    }
  } else {
    accepted = await flyover.acceptQuote(quote);
  }
  void accepted; // signature is not used directly by this CLI for peg-in display

  const status = await flyover.getPeginStatus(quote.quoteHash);
  const depositAddress: string = status?.status?.depositAddress;
  const txHash: string | undefined =
    status?.status?.registerPeginTxHash || status?.status?.callForUserTxHash;

  logInfo(isExternal, `📥 BTC deposit address: ${depositAddress}`);
  if (txHash) {
    logSuccess(isExternal, `✅ Peg-in transaction prepared. TxHash: ${txHash}`);
  } else {
    logSuccess(
      isExternal,
      `✅ Peg-in quote accepted. Deposit address prepared (transaction hash available after deposit).`
    );
  }

  return {
    txHash,
    totalFeeEstimate: formatRbtc(totalFeeEstimateWei),
    quoteExpiresAt,
    depositAddress,
    quoteId: quote.quoteHash,
    callFeeEstimate: formatRbtc(quote.quote.callFee),
    gasFeeEstimate: formatRbtc(quote.quote.gasFee),
  };
}

async function handlePegOut(_params: {
  isTestnet: boolean;
  amount: number;
  btcAddress: string;
  isExternal: boolean;
  walletName?: string;
  walletsData?: WalletData;
  password?: string;
  spinner?: SpinnerWrapper;
  provider?: string;
  trustedWalletName?: string;
  trustedPrivateKey?: string;
}): Promise<Pick<
  NonNullable<SwapResult["data"]>,
  "txHash" | "totalFeeEstimate" | "quoteExpiresAt"
  | "quoteId"
  | "callFeeEstimate"
  | "gasFeeEstimate"
  | "btcDestinationAddress"
>> {
  const {
    isTestnet,
    amount,
    btcAddress,
    isExternal,
    walletName,
    walletsData,
    password,
    spinner,
    provider,
  } = _params;
  const amountWei = parseUnits(amount.toString(), 18);

  const formattedBtcAddress = btcAddress.trim();
  if (!FlyoverUtils.isBtcAddress(formattedBtcAddress)) {
    throw new Error(`Invalid BTC address.`);
  }
  const isCorrectNetwork = isTestnet
    ? FlyoverUtils.isBtcTestnetAddress(formattedBtcAddress)
    : FlyoverUtils.isBtcMainnetAddress(formattedBtcAddress);
  if (!isCorrectNetwork) {
    throw new Error(`Invalid BTC address for ${isTestnet ? "testnet" : "mainnet"}`);
  }

  const { rskAddress, connection, resolvedWalletName } = await createBlockchainConnectionFromWallet({
    testnet: isTestnet,
    isExternal,
    walletName,
    walletsData,
    password,
    spinner,
  });

  const reuseTrustedConnection =
    !_params.trustedPrivateKey &&
    !!_params.trustedWalletName?.trim() &&
    normalizeWalletLabel(_params.trustedWalletName) === normalizeWalletLabel(resolvedWalletName);

  let selectedProvider: any;
  const captchaTokenResolver = async () =>
    resolveCaptchaToken({
      isExternal,
      spinner,
      providerName: selectedProvider?.name,
      providerApiBaseUrl: selectedProvider?.apiBaseUrl,
      providerSiteKey: selectedProvider?.siteKey,
    });
  const flyover = new Flyover({
    network: getFlyoverNetwork(isTestnet),
    rskConnection: connection,
    captchaTokenResolver,
    allowInsecureConnections: false,
  });

  const providers = await flyover.getLiquidityProviders();
  const pegoutProviders = (providers as any[]).filter((p) => p?.pegout);
  selectedProvider = selectProvider({
    providers: pegoutProviders,
    providerSelector: provider,
    operationLabel: "peg-out",
  });

  logInfo(
    isExternal,
    `🧩 Selected LP: ${selectedProvider.name ?? "Unknown"} (${selectedProvider.apiBaseUrl ?? "no apiBaseUrl"})`
  );
  logInfo(isExternal, `🔑 LP siteKey: ${selectedProvider.siteKey ?? "no siteKey"}`);

  flyover.useLiquidityProvider(selectedProvider);

  const quoteRequest = {
    to: formattedBtcAddress,
    rskRefundAddress: rskAddress,
    valueToTransfer: amountWei,
  };

  const quotes = await flyover.getPegoutQuotes(quoteRequest as any);
  if (!quotes || quotes.length === 0) {
    throw new Error("No peg-out quotes available for the provided amount/address.");
  }

  const quote = quotes[0] as any;
  const totalFeeEstimateWei = FlyoverUtils.getQuoteTotal(quote);
  const quoteExpiresAt = toIsoDate(quote.quote.expireDate);

  logInfo(isExternal, `📄 Peg-out quote id: ${quote.quoteHash}`);
  logInfo(isExternal, `🎯 BTC destination address: ${formattedBtcAddress}`);
  logInfo(
    isExternal,
    `💱 Fee estimate: call=${formatRbtc(quote.quote.callFee)} RBTC, gas=${formatRbtc(quote.quote.gasFee)} RBTC, total=${formatRbtc(totalFeeEstimateWei)} RBTC`
  );
  logInfo(isExternal, `⏳ Quote expires at: ${quoteExpiresAt}`);

  const trusted = await createTrustedFlyoverSigner({
    isTestnet,
    isExternal,
    trustedWalletName: _params.trustedWalletName,
    trustedPrivateKey: _params.trustedPrivateKey,
    walletsData,
    password,
    spinner,
    reuseSigner: reuseTrustedConnection ? { rskAddress, connection } : undefined,
  });

  let acceptedQuote: any;
  if (trusted) {
    trusted.trustedFlyover.useLiquidityProvider(selectedProvider);
    const signature = await (trusted.trustedFlyover as any).signQuote(quote);
    logInfo(isExternal, `🔐 Using trusted account to accept quote: ${trusted.trustedAddress}`);
    try {
      acceptedQuote = await (flyover as any).acceptAuthenticatedPegoutQuote(quote, signature);
    } catch (e) {
      rethrowIfTrustedAccountRejected(e);
    }
  } else {
    acceptedQuote = await flyover.acceptPegoutQuote(quote);
  }
  const txHash = await flyover.depositPegout(quote, acceptedQuote.signature, totalFeeEstimateWei);

  logSuccess(isExternal, `✅ Peg-out transaction executed. TxHash: ${txHash}`);

  return {
    txHash,
    totalFeeEstimate: formatRbtc(totalFeeEstimateWei),
    quoteExpiresAt,
    quoteId: quote.quoteHash,
    callFeeEstimate: formatRbtc(quote.quote.callFee),
    gasFeeEstimate: formatRbtc(quote.quote.gasFee),
    btcDestinationAddress: formattedBtcAddress,
  };
}

function resolveSwapModeFromFlags(params: SwapCommandOptions): SwapMode | undefined {
  const candidates: Array<{ mode: SwapMode; enabled: boolean | undefined }> = [
    { mode: "liquidity", enabled: params.liquidity },
    { mode: "pegin", enabled: params.pegin },
    { mode: "pegout", enabled: params.pegout },
  ];

  const enabled = candidates.filter((c) => !!c.enabled);
  if (enabled.length === 0) return undefined;
  if (enabled.length > 1) return undefined;
  return enabled[0].mode;
}

export async function swapCommand(
  params: SwapCommandOptions
): Promise<SwapResult | void> {
  const config = getConfig();
  const isTestnet =
    params.testnet !== undefined ? params.testnet : config.defaultNetwork === "testnet";

  const spinner = createSpinner(params.isExternal || false);

  try {
    let mode: SwapMode | undefined = resolveSwapModeFromFlags(params);

    if (params.interactive) {
      if (params.isExternal) {
        const errorMessage = "Interactive mode is not supported in external (MCP) mode.";
        logError(params.isExternal || false, errorMessage);
        return { success: false, error: errorMessage };
      }

      const { selectedMode } = await inquirer.prompt<{
        selectedMode: Exclude<SwapMode, "liquidity">;
      }>([
        {
          type: "list",
          name: "selectedMode",
          message: "Select swap operation:",
          choices: [
            { name: "Peg-in (BTC -> rBTC)", value: "pegin" },
            { name: "Peg-out (rBTC -> BTC)", value: "pegout" },
          ],
        },
      ]);

      mode = selectedMode;

      const amountPrompt =
        mode === "pegin"
          ? "Enter BTC amount to peg in:"
          : "Enter rBTC amount to peg out:";

      const { amount } = await inquirer.prompt<{ amount: number }>([
        {
          type: "number",
          name: "amount",
          message: amountPrompt,
          validate: (value) => {
            if (value === undefined) return "Amount is required";
            return value > 0 ? true : "Amount must be greater than 0";
          },
        },
      ]);
      params.amount = amount;

      if (mode === "pegout") {
        const { btcAddress } = await inquirer.prompt<{ btcAddress: string }>([
          {
            type: "input",
            name: "btcAddress",
            message: "Enter destination BTC address:",
          },
        ]);
        params.btcAddress = btcAddress;
      }
    }

    if (!mode) {
      const errorMessage =
        "Please specify exactly one operation: --liquidity, --pegin, or --pegout (or use --interactive).";
      logError(params.isExternal || false, errorMessage);
      return { success: false, error: errorMessage };
    }

    if (mode === "liquidity") {
      spinner.start("⏳ Fetching liquidity providers...");

      const liquidityProviders = await getLiquidityProviders({ isTestnet });

      spinner.succeed(chalk.white("Liquidity providers retrieved successfully"));
      logSuccess(
        params.isExternal || false,
        `✅ Found ${liquidityProviders?.length ?? 0} liquidity provider(s).`
      );

      if (params.isExternal) {
        return {
          success: true,
          data: {
            mode,
            liquidityProviders,
          },
        };
      }

      // Non-external mode: console output only (kept consistent with other commands).
      if (!liquidityProviders || liquidityProviders.length === 0) {
        logInfo(params.isExternal || false, "⚠️ No liquidity providers returned.");
      }

      return {
        success: true,
        data: {
          mode,
          liquidityProviders,
        },
      };
    }

    // From this point on, peg-in/peg-out require wallet signing via the Flyover SDK.
    if (mode === "pegin") {
      if (!params.amount || params.amount <= 0) {
        const errorMessage = "Amount is required for --pegin and must be greater than 0.";
        logError(params.isExternal || false, errorMessage);
        return { success: false, error: errorMessage };
      }

      spinner.start("⏳ Fetching peg-in quote...");

      // Ensure wallet inputs are present in external mode (MCP usage pattern).
      if (params.isExternal && (!params.walletsData || !params.password || !params.walletName)) {
        const errorMessage =
          "In external mode, --pegin requires walletName, password, and walletsData.";
        logError(params.isExternal || false, errorMessage);
        return { success: false, error: errorMessage };
      }

      const result = await handlePegIn({
        isTestnet,
        amount: params.amount,
        isExternal: params.isExternal || false,
        walletName: params.walletName,
        walletsData: params.walletsData,
        password: params.password,
        spinner,
        provider: params.provider,
        trustedWalletName: params.trustedWalletName,
        trustedPrivateKey: params.trustedPrivateKey,
      });

      spinner.start("⏳ Finalizing peg-in...");
      spinner.succeed(chalk.white("Peg-in flow prepared successfully"));

      return {
        success: true,
        data: {
          mode,
          ...result,
        },
      };
    }

    // mode === "pegout"
    if (!params.amount || params.amount <= 0) {
      const errorMessage = "Amount is required for --pegout and must be greater than 0.";
      logError(params.isExternal || false, errorMessage);
      return { success: false, error: errorMessage };
    }
    if (!params.btcAddress) {
      const errorMessage = "btcAddress is required for --pegout.";
      logError(params.isExternal || false, errorMessage);
      return { success: false, error: errorMessage };
    }

    spinner.start("⏳ Fetching peg-out quote...");

    if (params.isExternal && (!params.walletsData || !params.password || !params.walletName)) {
      const errorMessage =
        "In external mode, --pegout requires walletName, password, and walletsData.";
      logError(params.isExternal || false, errorMessage);
      return { success: false, error: errorMessage };
    }

    const result = await handlePegOut({
      isTestnet,
      amount: params.amount,
      btcAddress: params.btcAddress,
      isExternal: params.isExternal || false,
      walletName: params.walletName,
      walletsData: params.walletsData,
      password: params.password,
      spinner,
      provider: params.provider,
      trustedWalletName: params.trustedWalletName,
      trustedPrivateKey: params.trustedPrivateKey,
    });

    spinner.start("⏳ Finalizing peg-out...");
    spinner.succeed(chalk.white("Peg-out flow prepared successfully"));

    return {
      success: true,
      data: {
        mode,
        ...result,
      },
    };
  } catch (error: any) {
    const errorMessage =
      error instanceof Error ? error.message : "Error executing swap (unknown error).";
    spinner.fail(chalk.red(`❌ ${errorMessage}`));
    // Avoid duplicating the same line on the console for non-external (MCP) runs.
    if (params.isExternal) {
      logError(true, errorMessage);
    }
    return { success: false, error: errorMessage };
  } finally {
    if (!params.isExternal) {
      spinner.stop();
    }
  }
}

