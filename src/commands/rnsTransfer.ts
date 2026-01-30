import chalk from 'chalk';
import { ethers } from 'ethers';
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
const { RSKRegistrar } = rnsSdk;

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

  // try {
  //   const signer = await getEthersSigner(wallet, rpcUrl);

  //   // 1. Initialize Registrar
  //   const registrar = new RSKRegistrar(
  //     ethers.utils.getAddress(RNSADDRESSES.rskOwnerAddress[network].toLowerCase()),
  //     ethers.utils.getAddress(RNSADDRESSES.fifsAddrRegistrarAddress[network].toLowerCase()),
  //     ethers.utils.getAddress(TOKENS["RIF"][network].toLowerCase()),
  //     signer
  //   );

  //   const label = domain.replace(".rsk", "");
  //   const cleanRecipient = ethers.utils.getAddress(recipient.toLowerCase());

  //   logInfo(isExternal, `📦 Preparing to transfer '${domain}' to ${cleanRecipient}...`);

  //   // 2. Check Ownership (Pre-flight check)
  //   // We check ownerOf the label to ensure the current wallet actually owns it
  //   const owner = await registrar.ownerOf(label);
  //   if (owner.toLowerCase() !== signer.address.toLowerCase()) {
  //     logError(isExternal, `❌ You do not own '${domain}'. Current owner: ${owner}`);
  //     return;
  //   }

  //   // 3. Check Gas Balance
  //   const rbtcBalance = await signer.getBalance();
  //   if (rbtcBalance.eq(0)) {
  //      logError(isExternal, `❌ Insufficient ${TOKENS_METADATA.RBTC[network]} for gas.`);
  //      return;
  //   }

  //   logWarning(isExternal, `🔄 Transferring ownership...`);

  //   // 4. Execute Transfer
  //   // The SDK's transfer method handles the 'setOwner' call on the RNS Registry
  //   const transferTx = await registrar.transfer(label, cleanRecipient);
    
  //   logMessage(isExternal, `Tx Hash: ${transferTx.hash}`, chalk.dim);
    
  //   await transferTx.wait();

  //   logSuccess(
  //     isExternal,
  //     `✅ Success! '${domain}' has been transferred to ${cleanRecipient}`
  //   );
  // } catch (error: any) {
  //   // Handle specific Ethers/RNS errors
  //   const errorMessage = error.reason || error.message || error;
  //   logError(isExternal, `Transfer Error: ${errorMessage}`);
  // }
}