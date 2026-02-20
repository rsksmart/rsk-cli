import path from "path";

export const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const METHOD_TYPES = {
  read: "read",
  write: "write",
};

export const ALLOWED_BRIDGE_METHODS = {
  [METHOD_TYPES.read]: [
    "getBtcBlockchainBestChainHeight",
    "getStateForBtcReleaseClient",
    "getStateForDebugging",
    "getBtcBlockchainInitialBlockHeight",
    "getBtcBlockchainBlockHashAtDepth",
    "getBtcTxHashProcessedHeight",
    "isBtcTxHashAlreadyProcessed",
    "getFederationAddress",
    "getFederationSize",
    "getFederationThreshold",
    "getFederatorPublicKey",
    "getFederatorPublicKeyOfType",
    "getFederationCreationTime",
    "getFederationCreationBlockNumber",
    "getRetiringFederationAddress",
    "getRetiringFederationSize",
    "getRetiringFederationThreshold",
    "getRetiringFederatorPublicKeyOfType",
    "getRetiringFederationCreationTime",
    "getRetiringFederationCreationBlockNumber",
    "getPendingFederationHash",
    "getPendingFederationSize",
    "getPendingFederatorPublicKeyOfType",
    "getFeePerKb",
    "getMinimumLockTxValue",
    "getBtcTransactionConfirmations",
    "getLockingCap",
    "hasBtcBlockCoinbaseTransactionInformation",
    "getActiveFederationCreationBlockHeight",
    "getBtcBlockchainBestBlockHeader",
    "getBtcBlockchainBlockHeaderByHash",
    "getBtcBlockchainBlockHeaderByHeight",
    "getBtcBlockchainParentBlockHeaderByHash",
    "getEstimatedFeesForNextPegOutEvent",
    "getNextPegoutCreationBlockNumber",
    "getQueuedPegoutsCount",
    "getActivePowpegRedeemScript",
  ],
  [METHOD_TYPES.write]: [
    "registerBtcTransaction",
    "registerBtcCoinbaseTransaction",
    "receiveHeader",
  ],
};

export const NETWORK_NAMES = {
  mainnet: "Rootstock Mainnet",
  testnet: "Rootstock Testnet"
} as const;

export function getNetworkName(isTestnet: boolean): string {
  return isTestnet ? NETWORK_NAMES.testnet : NETWORK_NAMES.mainnet;
}

export const EXPLORER_URLS = {
  mainnet: {
    base: "https://explorer.rootstock.io",
    address: (address: string) => `https://explorer.rootstock.io/address/${address}`,
    tx: (txHash: string) => `https://explorer.rootstock.io/tx/${txHash}`,
    attestation: (uid: string) => `https://explorer.rootstock.io/ras/attestation/${uid}`
  },
  testnet: {
    base: "https://explorer.testnet.rootstock.io",
    address: (address: string) => `https://explorer.testnet.rootstock.io/address/${address}`,
    tx: (txHash: string) => `https://explorer.testnet.rootstock.io/tx/${txHash}`,
    attestation: (uid: string) => `https://explorer.testnet.rootstock.io/ras/attestation/${uid}`
  }
} as const;

export function getExplorerUrl(isTestnet: boolean, type: 'address' | 'tx', identifier: string): string {
  const explorer = isTestnet ? EXPLORER_URLS.testnet : EXPLORER_URLS.mainnet;
  return explorer[type](identifier);
}

export function getAttestationViewerUrl(isTestnet: boolean, uid: string): string {
  const explorer = isTestnet ? EXPLORER_URLS.testnet : EXPLORER_URLS.mainnet;
  return explorer.attestation(uid);
}

export const WEI_DECIMALS = 18;
export const WEI_MULTIPLIER = 10 ** WEI_DECIMALS;

export const UNKNOWN_ERROR_MESSAGE = "Unknown error";

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function extractContractName(abiPath: string): string {
  const fileName = abiPath.includes('/')
    ? abiPath.split('/').pop()
    : abiPath;

  return fileName?.replace('.json', '') || 'Unknown';
}
