import chalk from "chalk";
import { BigNumber, Signer } from "ethers";
import { RNSADDRESSES } from "../constants/rnsAddress.js";
import { TOKENS } from "../constants/tokenAdress.js";
import { getEthersSigner } from "../utils/ethersWallet.js";
import {
  logInfo,
  logError,
  logSuccess,
  logWarning,
  logMessage,
} from "../utils/logger.js";
import rnsSdk from "@rsksmart/rns-sdk";
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
    ? "https://public-node.testnet.rsk.co"
    : "https://public-node.rsk.co";

  try {
    const signer = await getEthersSigner(wallet, rpcUrl);
    const registrar = new RSKRegistrar(
      RNSADDRESSES.rskOwnerAddress[network],
      RNSADDRESSES.fifsAddrRegistrarAddress[network],
      TOKENS["RIF"][network],
      signer as any
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
    console.log(chalk.dim(`Price: ${price.toString()} units (wei/RIF)`));

    console.log(chalk.yellow("Step 1/2: Sending commitment..."));
    const { makeCommitmentTransaction, secret, canReveal } =
      await registrar.commitToRegister(label, signer.address);

    logMessage(
      isExternal,
      `Price: ${price.toString()} units (wei/RIF)`,
      chalk.dim
    );

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
    logMessage(isExternal, `Tx Hash: ${registerTx.hash}`, chalk.dim);
    await registerTx.wait();

    logSuccess(
      isExternal,
      `Success! '${domain}' is now registered to ${signer.address} ✅`
    );
  } catch (error: any) {
    logError(isExternal, `Registration Error: ${error.message || error}`);
  }
}
