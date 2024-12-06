import path from "path";

export const walletFilePath = path.join(process.cwd(), "rootstock-wallet.json");

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
