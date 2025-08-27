import path from "path";

export const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const RNS_REGISTRY_MAINNET = "0xcb868aeabd31e2b66f74e9a55cf064abb31a4ad5" as const;
export const RNS_RESOLVER_MAINNET = "0xD87f8121D44F3717d4bAdC50b24E50044f86D64B" as const;

export const RNS_REGISTRY_TESTNET = "0x7d284aaac6e925aad802a53c0c69efe3764597b8" as const;
export const RNS_RESOLVER_TESTNET = "0x1e321bf4e5f0c20e5f5afaa2390ef6ff8cff8a7b" as const;

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
