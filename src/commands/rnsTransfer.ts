import chalk from "chalk";
import { ethers } from "ethers";
import { RNSADDRESSES } from "../constants/rnsAddress.js";
import { TOKENS, TOKENS_METADATA } from "../constants/tokenAdress.js";
import { getEthersSigner } from "../utils/ethersWallet.js";
import {
  logInfo,
  logError,
  logSuccess,
  logWarning,
  logMessage,
} from "../utils/logger.js";
import { rootstock, rootstockTestnet } from "viem/chains";
import rnsSdk from "@rsksmart/rns-sdk";
import { EXPLORER } from "../constants/explorer.js";
const { PartnerRegistrar } = rnsSdk;

interface RnsTransferOptions {
  domain: string;
  wallet: string;
  testnet?: boolean;
  recipient: string;
  isExternal?: boolean;
}

export async function rnsTransferCommand(options: RnsTransferOptions) {
  const { domain, wallet, testnet, recipient, isExternal = false } = options;
  const network = testnet ? "testnet" : "mainnet";
  const rpcUrl = testnet
    ? rootstockTestnet.rpcUrls.default.http[0]
    : rootstock.rpcUrls.default.http[0];

  try {
    const signer = await getEthersSigner(wallet, rpcUrl);

    const partnerRegistrar = new PartnerRegistrar(signer, network);

    const label = domain.replace(".rsk", "");
    const cleanRecipient = ethers.utils.getAddress(recipient.toLowerCase());

    // Check if the domain is registered
    const isAvailable = await partnerRegistrar.available(label);

    if (isAvailable) {
      logError(
        isExternal,
        `❌ The domain '${domain}' is not registered yet. You can only transfer domains you already own.`
      );
      return;
    }

    // Check Ownership
    const owner = await partnerRegistrar.ownerOf(label);
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      logError(
        isExternal,
        `❌ You do not own '${domain}'. Current owner: ${owner}`
      );
      return;
    }

    logInfo(
      isExternal,
      `Preparing to transfer '${domain}' to ${cleanRecipient}...`
    );

    // Check Gas Balance
    const rbtcBalance = await signer.getBalance();
    if (rbtcBalance.eq(0)) {
      logError(
        isExternal,
        `❌ Insufficient ${TOKENS_METADATA.RBTC[network]} for gas.`
      );
      return;
    }

    logWarning(isExternal, `🔄 Transferring ownership...`);

    // Execute Transfer : the transfer method handles everything and returns the hash

    const transferTxHash = await partnerRegistrar.transfer(
      label,
      cleanRecipient
    );

    // logMessage(isExternal, `Tx Hash: ${transferTx}`, chalk.dim);
    logMessage(
      isExternal,
      `Tx: ${EXPLORER.BLOCKSCOUT[network]}/tx/${transferTxHash}`,
      chalk.dim
    );

    logSuccess(
      isExternal,
      `✅ Success! '${domain}' has been transferred to ${cleanRecipient}`
    );
  } catch (error: any) {
    const errorMessage = error.reason || error.message || error;
    logError(isExternal, `Transfer Error: ${errorMessage}`);
  }
}
