import chalk from "chalk";
import { ethers } from "ethers";
import { RNSADDRESSES } from "../constants/rnsAddress.js";
import { TOKENS_METADATA } from "../constants/tokenAdress.js";
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

const { AddrResolver, PartnerRegistrar } = rnsSdk;

interface RnsUpdateOptions {
  domain: string;
  wallet: string;
  address: string;
  testnet?: boolean;
  isExternal?: boolean;
}

export async function rnsUpdateCommand(options: RnsUpdateOptions) {
  const { domain, wallet, address, testnet, isExternal = false } = options;
  const network = testnet ? "testnet" : "mainnet";
  const rpcUrl = testnet
    ? rootstockTestnet.rpcUrls.default.http[0]
    : rootstock.rpcUrls.default.http[0];

  try {
    const signer = await getEthersSigner(wallet, rpcUrl);
    const registryAddress = ethers.utils.getAddress(
      RNSADDRESSES.rnsRegistryAddress[network]
    );
    const partnerRegistrar = new PartnerRegistrar(signer, network);

    const addrResolver = new AddrResolver(registryAddress, signer);
    const cleanRecipientAddress = ethers.utils.getAddress(
      address.toLowerCase()
    );

    logInfo(isExternal, `Preparing to update records for '${domain}'...`);

    const rbtcBalance = await signer.getBalance();
    if (rbtcBalance.eq(0)) {
      logError(
        isExternal,
        `❌ Insufficient ${TOKENS_METADATA.RBTC[network]} for gas.`
      );
      if (network == "testnet") {
        logMessage(
          isExternal,
          `💡 Get test rBTC here: ${TOKENS_METADATA.RBTC.faucet.link}`,
          chalk.yellow
        );
      }
      return;
    }

    const label = domain.replace(".rsk", "");

    const isAvailable = await partnerRegistrar.available(label);
    if (isAvailable) {
      logError(
        isExternal,
        `❌ The domain '${domain}' is not registered yet. You can only update domains you already own.`
      );
      return;
    }

    const owner = await partnerRegistrar.ownerOf(label);
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      logError(
        isExternal,
        `❌ You do not own '${domain}' and can't update it. Current owner: ${owner}`
      );
      return;
    }

    logWarning(
      isExternal,
      `🔄 Setting resolution address to ${cleanRecipientAddress}...`
    );

    const updateTx = await addrResolver.setAddr(domain, cleanRecipientAddress);
    logMessage(
      isExternal,
      `Tx: ${EXPLORER.BLOCKSCOUT[network]}/tx/${updateTx.hash}`,
      chalk.dim
    );
    await updateTx.wait();

    logSuccess(
      isExternal,
      `✅ Success! '${domain}' now resolves to ${cleanRecipientAddress}`
    );
  } catch (error: any) {
    const errorMessage = error.reason || error.message || error;
    logError(isExternal, `Update Error: ${errorMessage}`);
  }
}
