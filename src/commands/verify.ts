import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import { VerifyResult, VerificationRequest } from "../utils/types.js";

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
    `${baseUrl}/api/v3/addresses/verification/${address.toLowerCase()}`
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

    const solidityVersion = parsedJson.solcLongVersion.split('+')[0];
    const { sources, settings } = parsedJson.input;
    
    const transformedSettings = {
      optimizer: settings.optimizer || { enabled: false, runs: 200 },
      evmVersion: settings.evmVersion || 'london',
    };
    
    parsedJson.sources = sources;
    parsedJson.settings = settings;

    const verificationData: VerificationRequest = {
      address: address.toLowerCase(),
      name,
      version: solidityVersion,
      sources: JSON.stringify(sources),
      settings: transformedSettings,
    };

    if (args.length > 0) {
      if (!_isExternal) {
        spinner.stop();
        console.log(
          chalk.blue(`📄 Using constructor arguments: ${args.join(", ")}`)
        );
        spinner.start();
      }
      verificationData.constructorArguments = args;
    }

    const formData = new FormData();
    formData.append('data', JSON.stringify(verificationData));
    
    const jsonBlob = new Blob([JSON.stringify(parsedJson)], { type: 'application/json' });
    formData.append('file', jsonBlob, 'standard-input.json');

    let response;
    try {
      response = await fetch(`${baseUrl}/api/v3/verifications/verify`, {
        method: "POST",
        body: formData,
      });
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const errorMessage = `Network error during contract verification: ${errorMsg}`;
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
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `Error during contract verification: ${errorText}`;
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
    if (!resData.success) {
      const errorMessage = resData.message || "Contract verification failed";
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
          verificationData: resData.data,
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
