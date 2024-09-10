import chalk from "chalk";
import fs from "fs";
import ora from "ora";

export async function verifyCommand(
  jsonPath: string,
  testnet: boolean
): Promise<void> {
  try {
    console.log(
      chalk.blue(
        `🔧 Initializing verification on ${testnet ? "testnet" : "mainnet"}...`
      )
    );

    console.log(
      chalk.blue(`📄 Reading JSON Standard Output from ${jsonPath}...`)
    );
    const json = fs.readFileSync(jsonPath, "utf8");
    const parsedJson = JSON.parse(json);

    if (!Array.isArray(parsedJson)) {
      console.error(
        chalk.red("⚠️ The JSON Standard Output file has an invalid format.")
      );
      return;
    }

    const spinner = ora("⏳ Verifying contract...").start();

    try {
      // @ts-ignore
      const response = await fetch(`https://api-goerli.rootstock.io/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "bbc965c4-c3a3-4e10-8091-a17750df0d91",
        },

        body: JSON.stringify(parsedJson),
      });

      if (!response.ok) {
        spinner.fail("❌ Error during contract verification.");
        throw new Error("An error occurred during contract verification.");
      }

      spinner.succeed("🎉 Contract verification request sent!");

      spinner.start("⏳ Waiting for verification completion...");

      const data = await response.json();

      spinner.succeed("📜 Contract verified successfully!");

      const explorerUrl = testnet
        ? `https://explorer.testnet.rootstock.io/address/${data.contractAddress}`
        : `https://explorer.rootstock.io/address/${data.contractAddress}`;

      console.log(
        chalk.white(`🔗 View on Explorer:`),
        chalk.dim(`${explorerUrl}`)
      );
    } catch (error) {
      spinner.fail("❌ Error during contract verifications.");
      throw error;
    }
  } catch (error) {
    console.error("❌ Error deploying contract:", error);
  }
}
