import ViemProvider from "../utils/viemProvider.js";
import chalk from "chalk";
import fs from "fs";
import ora from "ora";

export async function deployCommand(
  abiPath: string,
  bytecodePath: string,
  testnet: boolean,
  args: any[] = [],
  name: string
): Promise<void> {
  try {
    console.log(
      chalk.blue(
        `🔧 Initializing ViemProvider for ${testnet ? "testnet" : "mainnet"}...`
      )
    );
    const provider = new ViemProvider(testnet);
    const walletClient = await provider.getWalletClient(name);

    if (!walletClient.account) {
      console.error(
        chalk.red(
          "🚨 Wallet account is undefined. Make sure the wallet is properly loaded."
        )
      );
      return;
    }

    console.log(
      chalk.blue(`🔑 Wallet account: ${walletClient.account.address}`)
    );

    console.log(chalk.blue(`📄 Reading ABI from ${abiPath}...`));
    const abiContent = fs.readFileSync(abiPath, "utf8");
    const abi = JSON.parse(abiContent);

    if (!Array.isArray(abi)) {
      console.error(chalk.red("⚠️ The ABI file is not a valid JSON array."));
      return;
    }

    console.log(chalk.blue(`📄 Reading Bytecode from ${bytecodePath}...`));
    let bytecode = fs.readFileSync(bytecodePath, "utf8").trim();
    if (!bytecode.startsWith("0x")) {
      bytecode = `0x${bytecode}`;
    }

    if (!bytecode) {
      console.error(chalk.red("⚠️ Invalid Bytecode file."));
      return;
    }

    const publicClient = await provider.getPublicClient();

    const deployParams = {
      abi,
      bytecode: bytecode as `0x${string}`,
      account: walletClient.account,
      args,
    };

    const spinner = ora("⏳ Deploying contract...").start();

    try {
      // @ts-ignore
      const hash = await walletClient.deployContract(deployParams);

      spinner.succeed("🎉 Contract deployment transaction sent!");
      console.log(`🔑 Transaction Hash: ${hash}`);

      spinner.start("⏳ Waiting for transaction receipt...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt?.status === "reverted") {
        throw new Error("An error occurred during contract deployment.");
      }

      spinner.succeed("📜 Contract deployed successfully!");

      console.log(
        chalk.green(`📍 Contract Address: ${receipt.contractAddress}`)
      );

      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/address/${receipt.contractAddress}`
        : `https://explorer.rootstock.io/address/${receipt.contractAddress}`;

      console.log(
        chalk.white(`🔗 View on Explorer:`),
        chalk.dim(`${explorerUrl}`)
      );
    } catch (error) {
      spinner.fail("❌ Error during contract deployment.");
      throw error;
    }
  } catch (error) {
    console.error("❌ Error deploying contract:", error);
  }
}
