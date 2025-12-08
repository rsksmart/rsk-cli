import fs from "fs";
import { getConfig } from "./config.js";
import { VerifyResult, VerificationRequest } from "../utils/types.js";
import { VerificationAttestationData, AttestationService } from "../utils/attestation.js";
import { handleAttestation } from "../utils/attestationHandler.js";
import { logError, logSuccess, logInfo } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";
import { getExplorerUrl, getNetworkName, getCurrentTimestamp } from "../utils/constants.js";

type VerifyCommandOptions = {
  jsonPath: string;
  address: string;
  name: string;
  testnet?: boolean;
  args?: any[];
  isExternal?: boolean;
  attestation?: {
    enabled: boolean;
    schemaUID?: string;
    recipient?: string;
  };
};

export async function verifyCommand(
  params: VerifyCommandOptions
): Promise<VerifyResult | void> {
  const config = getConfig();
  const isTestnet = params.testnet ?? (config.defaultNetwork === 'testnet');
  const isExternal = params.isExternal || false;

  logInfo(isExternal, `🔧 Initializing verification on ${isTestnet ? "testnet" : "mainnet"}...`);

  const baseUrl = isTestnet
    ? "https://be.explorer.testnet.rootstock.io"
    : "https://be.explorer.rootstock.io";

  const response = await fetch(
    `${baseUrl}/api/v3/addresses/verification/${params.address.toLowerCase()}`
  );

  const resData = await response.json();

  if (resData.data !== null) {
    const explorerUrl = getExplorerUrl(isTestnet, 'address', params.address);

    logSuccess(isExternal, `✅ Contract ${params.address} is already verified.`);

    return {
      success: true,
      data: {
        contractAddress: params.address,
        contractName: params.name,
        network: getNetworkName(isTestnet),
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
    logInfo(isExternal, `📄 Reading JSON Standard Input from ${params.jsonPath}...`);
    try {
      const json = fs.readFileSync(params.jsonPath, "utf8");
      parsedJson = JSON.parse(json);
    } catch (error) {
      const errorMessage = "Please check your JSON Standard Input file and try again.";
      logError(isExternal, errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }
  }
  
  logInfo(isExternal, `🔎 Verifying contract ${params.name} deployed at ${params.address}...`);

  const spinner = createSpinner(isExternal);
  spinner.start("Verifying contract...");

  try {
    if (
      !parsedJson.hasOwnProperty("solcLongVersion") ||
      !parsedJson.hasOwnProperty("input")
    ) {
      const errorMessage = "Please check your JSON Standard Input file and try again.";
      spinner.fail(errorMessage);
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
      spinner.stop();
      logInfo(isExternal, `📄 Using constructor arguments: ${params.args.join(", ")}`);
      spinner.start("Verifying...");
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
      spinner.fail( errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }
    
    if (!response.ok) {
      const errorMessage = "Error during contract verification";
      spinner.fail( errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const resData = await response.json();
    if (!resData.success) {
      const errorMessage = resData.message || "Contract verification failed";
      spinner.fail( errorMessage);
      return {
        error: errorMessage,
        success: false,
      };
    }

    const explorerUrl = getExplorerUrl(isTestnet, 'address', params.address);

    spinner.succeed("📜 Contract verified successfully!");
    logInfo(isExternal, `🔗 View on Explorer: ${explorerUrl}`);

    let attestationUID: string | null = null;
    if (params.attestation?.enabled) {
      const attestationData: VerificationAttestationData = {
        contractAddress: params.address,
        contractName: params.name,
        verifier: "", // Will be set by handleAttestation
        sourceCodeHash: AttestationService.createHash(JSON.stringify(parsedJson.sources || {})),
        compilationTarget: params.name,
        compilerVersion: solidityVersion,
        optimizationUsed: transformedSettings.optimizer?.enabled || false,
        timestamp: getCurrentTimestamp(),
        verificationTool: "rsk-cli"
      };

      const result = await handleAttestation('verification', attestationData, {
        enabled: params.attestation.enabled,
        testnet: params.testnet,
        schemaUID: params.attestation.schemaUID,
        recipient: params.attestation.recipient || params.address,
        isExternal: params.isExternal
      });

      attestationUID = result.uid;
    }

    return {
      success: true,
      data: {
        contractAddress: params.address,
        contractName: params.name,
        network: getNetworkName(isTestnet),
        explorerUrl: explorerUrl,
        verified: true,
        verificationData: resData.data,
        attestationUID: attestationUID || undefined,
      },
    };
  } catch (error) {
    const errorMessage = "Error during contract verification";
    spinner.fail( errorMessage);
    return {
      error: errorMessage,
      success: false,
    };
  }
}