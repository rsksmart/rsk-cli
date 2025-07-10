import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import { wait } from "../utils/index.js";
import { VerifyResult } from "../utils/types.js";

export async function verifyCommand(
  jsonPath: string,
  address: string,
  name: string,
  testnet: boolean,
  args: any[] = [],
  _isExternal?: boolean
): Promise<VerifyResult | void> {
  if (!_isExternal) {
    console.log(
      chalk.blue(
        `🔧 Initializing verification on ${testnet ? "testnet" : "mainnet"}...`
      )
    );
  }

  const baseUrl = testnet
    ? "https://be.explorer.testnet.rootstock.io"
    : "https://be.explorer.rootstock.io";

  const response = await fetch(
    `${baseUrl}/api?module=verificationResults&action=getVerification&address=${address.toLowerCase()}`
  );

  const resData = await response.json();

  if (resData.data !== null) {
    const explorerUrl = testnet
      ? `https://explorer.testnet.rootstock.io/address/${address}`
      : `https://explorer.rootstock.io/address/${address}`;

    if (_isExternal) {
      return {
        success: true,
        data: {
          contractAddress: address,
          contractName: name,
          network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
          explorerUrl: explorerUrl,
          verified: true,
          alreadyVerified: true,
        },
      };
    } else {
      console.log(
        chalk.green(
          `✅ Contract ${chalk.green(`${address}`)} is already verified.`
        )
      );
      return;
    }
  }

  let parsedJson;

  if (_isExternal) {
    try {
      parsedJson = JSON.parse(jsonPath);
    } catch (error) {
      return {
        error: "Error parsing JSON Standard Input content",
        success: false,
      };
    }
  } else {
    console.log(chalk.blue(`📄 Reading JSON Standard Input from ${jsonPath}...`));
    try {
      const json = fs.readFileSync(jsonPath, "utf8");
      parsedJson = JSON.parse(json);
    } catch (error) {
      console.error(
        chalk.red("⚠️ Please check your JSON Standard Input file and try again.")
      );
      return;
    }
  }

  if (!_isExternal) {
    console.log(
      `🔎 Verifying contract ${chalk.green(`${name}`)} deployed at ${chalk.green(
        `${address}`
      )}..`
    );
  }

  const spinner = _isExternal ? ora({isEnabled: false}) : ora().start();

  try {
    if (
      !parsedJson.hasOwnProperty("solcLongVersion") ||
      !parsedJson.hasOwnProperty("input")
    ) {
      const errorMessage = "Please check your JSON Standard Input file and try again.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner.fail(`❌ ${errorMessage}`);
        return;
      }
    }

    const solidityVersion = parsedJson.solcLongVersion;

    const { language, sources, settings } = parsedJson.input;

    const requestBody = {
      module: "contractVerifier",
      action: "verify",
      getDelayed: true,
      params: {
        request: {
          address: address.toLowerCase(),
          name,
          version: solidityVersion,
          language,
          sources,
          settings,
        },
      },
    };

    if (args.length > 0) {
      if (!_isExternal) {
        spinner.stop();
        console.log(
          chalk.blue(`📄 Using constructor arguments: ${args.join(", ")}`)
        );
        spinner.start();
      }
      // @ts-ignore
      requestBody.params.request.constructorArguments = args;
    }

    const response = await fetch(`${baseUrl}/api`, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorMessage = "Error during contract verification.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner.fail(`❌ ${errorMessage}`);
        return;
      }
    }

    const resData = await response.json();
    const { _id } = resData.data;

    if (!_isExternal) {
      spinner.succeed("🎉 Contract verification request sent!");
      spinner.start("⏳ Waiting for verification confirmation...");
    }

    const maxRetries = 10;
    const retryDelay = 4000;

    const match = await pollVerificationResult(
      baseUrl,
      _id,
      maxRetries,
      retryDelay,
      _isExternal
    );

    if (!match) {
      const errorMessage = "JSON Standard Input verification don't match.";
      if (_isExternal) {
        return {
          error: errorMessage,
          success: false,
        };
      } else {
        spinner.fail(`❌ ${errorMessage}`);
        return;
      }
    }

    const explorerUrl = testnet
      ? `https://explorer.testnet.rootstock.io/address/${address}`
      : `https://explorer.rootstock.io/address/${address}`;

    if (_isExternal) {
      return {
        success: true,
        data: {
          contractAddress: address,
          contractName: name,
          network: testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
          explorerUrl: explorerUrl,
          verified: true,
        },
      };
    } else {
      spinner.succeed("📜 Contract verified successfully!");

      console.log(
        chalk.white(`🔗 View on Explorer:`),
        chalk.dim(`${explorerUrl}`)
      );
    }
  } catch (error) {
    const errorMessage = "Error during contract verification.";
    if (_isExternal) {
      return {
        error: `${errorMessage}${error instanceof Error ? ': ' + error.message : ''}`,
        success: false,
      };
    } else {
      spinner.fail(`❌ ${errorMessage}`);
      return;
    }
  }
}

async function pollVerificationResult(
  baseUrl: string,
  verificationId: string,
  maxRetries: number,
  retryDelay: number,
  _isExternal?: boolean
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const confirmation = await fetch(
      `${baseUrl}/api?module=contractVerifier&action=getVerificationResult&id=${verificationId}`
    );

    if (!confirmation.ok) {
      if (!_isExternal) {
        console.log(
          chalk.yellow("⚠️ Error fetching verification status, retrying...")
        );
      }
    } else {
      const confirmationData = await confirmation.json();
      const { match } = confirmationData.data;

      if (match !== undefined) {
        return match;
      }
    }

    await wait(retryDelay);
  }

  if (!_isExternal) {
    console.log(
      chalk.red(
        "⚠️ Maximum retries reached, verification status could not be confirmed."
      )
    );
  }
  return false;
}
