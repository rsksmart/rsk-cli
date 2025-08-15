import chalk from "chalk";
import fs from "fs";
import ora from "ora";
import { VerifyResult, VerificationRequest } from "../utils/types.js";

type VerifyCommandOptions = {
  jsonPath: string;
  address: string;
  name: string;
  testnet: boolean;
  args?: any[];
  isExternal?: boolean;
};

function logMessage(
  params: VerifyCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: VerifyCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: VerifyCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: VerifyCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function startSpinner(
  params: VerifyCommandOptions,
  spinner: any,
  message?: string
) {
  if (!params.isExternal) {
    if (message) {
      spinner.start(message);
    } else {
      spinner.start();
    }
  }
}

function stopSpinner(params: VerifyCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function succeedSpinner(
  params: VerifyCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.succeed(message);
  }
}

function failSpinner(
  params: VerifyCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.fail(message);
  }
}

export async function verifyCommand(
  params: VerifyCommandOptions
): Promise<VerifyResult | void> {
  logInfo(params, `🔧 Initializing verification on ${params.testnet ? "testnet" : "mainnet"}...`);

  const baseUrl = params.testnet
    ? "https://be.explorer.testnet.rootstock.io"
    : "https://be.explorer.rootstock.io";

  const response = await fetch(
    `${baseUrl}/api/v3/addresses/verification/${params.address.toLowerCase()}`
  );

  const resData = await response.json();

  if (resData.data !== null) {
    const explorerUrl = params.testnet
      ? `https://explorer.testnet.rootstock.io/address/${params.address}`
      : `https://explorer.rootstock.io/address/${params.address}`;

    logSuccess(params, `✅ Contract ${params.address} is already verified.`);
    
    return {
      success: true,
      data: {
        contractAddress: params.address,
        contractName: params.name,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        explorerUrl: explorerUrl,
        verified: true,
        alreadyVerified: true,
      },
    };
  }

  let parsedJson;

  if (params.isExternal) {
    try {
      parsedJson = JSON.parse(params.jsonPath);
    } catch (error) {
      return {
        error: "Error parsing JSON Standard Input content",
        success: false,
      };
    }
  } else {
    logInfo(params, `📄 Reading JSON Standard Input from ${params.jsonPath}...`);
    try {
      const json = fs.readFileSync(params.jsonPath, "utf8");
      parsedJson = JSON.parse(json);
    } catch (error) {
      const errorMessage = "Please check your JSON Standard Input file and try again.";
      logError(params, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }
  }
  
  logInfo(params, `🔎 Verifying contract ${params.name} deployed at ${params.address}...`);

  const spinner = params.isExternal ? ora({isEnabled: false}) : ora();
  startSpinner(params, spinner);

  try {
    if (
      !parsedJson.hasOwnProperty("solcLongVersion") ||
      !parsedJson.hasOwnProperty("input")
    ) {
      const errorMessage = "Please check your JSON Standard Input file and try again.";
      failSpinner(params, spinner, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
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
      address: params.address.toLowerCase(),
      name: params.name,
      version: solidityVersion,
      sources: JSON.stringify(sources),
      settings: transformedSettings,
    };

    if (params.args && params.args.length > 0) {
      stopSpinner(params, spinner);
      logInfo(params, `📄 Using constructor arguments: ${params.args.join(", ")}`);
      startSpinner(params, spinner);
      verificationData.constructorArguments = params.args;
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
      const errorMessage = "Network error during contract verification";
      failSpinner(params, spinner, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }
    
    if (!response.ok) {
      const errorMessage = "Error during contract verification";
      failSpinner(params, spinner, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const resData = await response.json();
    if (!resData.success) {
      const errorMessage = resData.message || "Contract verification failed";
      failSpinner(params, spinner, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const explorerUrl = params.testnet
      ? `https://explorer.testnet.rootstock.io/address/${params.address}`
      : `https://explorer.rootstock.io/address/${params.address}`;

    succeedSpinner(params, spinner, "📜 Contract verified successfully!");
    logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);

    return {
      success: true,
      data: {
        contractAddress: params.address,
        contractName: params.name,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        explorerUrl: explorerUrl,
        verified: true,
        verificationData: resData.data,
      },
    };
  } catch (error) {
    const errorMessage = "Error during contract verification";
    failSpinner(params, spinner, errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}