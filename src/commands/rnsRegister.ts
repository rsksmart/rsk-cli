import chalk from "chalk";
import { BigNumber, ethers } from "ethers";
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
const { RSKRegistrar } = rnsSdk;

interface RnsRegisterOptions {
  domain: string;
  wallet: string;
  testnet?: boolean;
  isExternal?: boolean;
}

export async function rnsRegisterCommand(options: RnsRegisterOptions) {
  const { domain, wallet, testnet, isExternal = false } = options;
  const network = testnet ? "testnet" : "mainnet";
  const rpcUrl = testnet
    ? rootstockTestnet.rpcUrls.default.http[0]
    : rootstock.rpcUrls.default.http[0];

  try {
    const signer = await getEthersSigner(wallet, rpcUrl);
    const registrar = new RSKRegistrar(
      ethers.utils.getAddress(
        RNSADDRESSES.rskOwnerAddress[network].toLowerCase()
      ),
      ethers.utils.getAddress(
        RNSADDRESSES.fifsAddrRegistrarAddress[network].toLowerCase()
      ),
      ethers.utils.getAddress(TOKENS["RIF"][network].toLowerCase()),
      signer
    );
    const label = domain.replace(".rsk", "");
    logInfo(isExternal, `🔍 Checking availability for '${label}.rsk'...`);

    const available = await registrar.available(label);
    if (!available) {
      logError(isExternal, `❌ Domain '${label}.rsk' is already taken.`);
      return;
    }
    const duration = BigNumber.from(1); // Default 1 year
    const price = await registrar.price(label, duration as any);
    logMessage(
      isExternal,
      `Price: ${ethers.utils.formatUnits(price, 18)} ${
        TOKENS_METADATA.RIF[network]
      }`,
      chalk.dim
    );
    // check if the caller has enough gas for transaction and to purchase domain
    const rbtcBalance = await signer.getBalance();
    if (rbtcBalance.eq(0)) {
      logError(
        isExternal,
        `❌ Insufficient ${TOKENS_METADATA.RBTC[network]} balance for gas. Please fund your wallet.`
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
    // 2. Check tRIF Balance (for Registration Fee)
    const rifAddress = TOKENS["RIF"][network];
    const rifAbi = ["function balanceOf(address) view returns (uint256)"];
    const rifContract = new ethers.Contract(rifAddress, rifAbi, signer);
    const userRifBalance = await rifContract.balanceOf(signer.address);
    if (userRifBalance.lt(price)) {
      logError(
        isExternal,
        `❌ Insufficient tRIF. Have: ${ethers.utils.formatUnits(
          userRifBalance,
          18
        )} tRIF, Need: ${ethers.utils.formatUnits(price, 18)} ${
          TOKENS_METADATA.RIF[network]
        }`
      );
      if (network == "testnet") {
        logMessage(
          isExternal,
          `💡 Get test rBTC here: ${TOKENS_METADATA.RIF.faucet.link}`,
          chalk.yellow
        );
      }
      return;
    }

    logMessage(isExternal, "Step 1/2: Sending commitment...", chalk.yellow);
    const { makeCommitmentTransaction, secret, canReveal } =
      await registrar.commitToRegister(label, signer.address);

    await makeCommitmentTransaction.wait();
    logSuccess(isExternal, "✅ Commitment sent.");

    logMessage(
      isExternal,
      "⏳ Waiting for commitment maturity (approx 1 min)...",
      chalk.cyan
    );

    while (!(await canReveal())) {
      await new Promise((r) => setTimeout(r, 5000)); // check every 5s
      if (!isExternal) process.stdout.write(".");
    }
    if (!isExternal) console.log("");

    logWarning(isExternal, "Step 2/2: Registering domain...");

    const registerTx = await registrar.register(
      label,
      signer.address,
      secret,
      duration,
      price
    );
    logMessage(
      isExternal,
      `Tx: ${EXPLORER.BLOCKSCOUT[network]}/tx/${registerTx.hash}`,
      chalk.dim
    );
    await registerTx.wait();

    logSuccess(
      isExternal,
      `✅ Success! '${domain}' is now registered to ${signer.address}`
    );
  } catch (error: any) {
    logError(isExternal, `Registration Error: ${error.message || error}`);
  }
}
