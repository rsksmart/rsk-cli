import { ethers } from "ethers";
import ora from "ora";
import { logError, logInfo } from "./logger.js";
import { getAttestationViewerUrl } from "./constants.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

export interface AttestationConfig {
  contractAddress: string;
  schemaRegistryAddress: string;
  graphqlEndpoint: string;
}

export interface DeploymentAttestationData {
  contractAddress: string;
  contractName: string;
  deployer: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
  abiHash?: string;
  bytecodeHash?: string;
}

export interface VerificationAttestationData {
  contractAddress: string;
  contractName: string;
  verifier: string;
  sourceCodeHash: string;
  compilationTarget: string;
  compilerVersion: string;
  optimizationUsed: boolean;
  timestamp: number;
  verificationTool: string;
}

export interface TransferAttestationData {
  sender: string;
  recipient: string;
  amount: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  reason?: string;
  transferType: string;
}

export const RSK_ATTESTATION_CONFIG = {
  testnet: {
    contractAddress: "0xc300aeEaDd60999933468738c9F5D7e9C0671e1c",
    schemaRegistryAddress: "0x679c62956cD2801AbAbF80e9D430f18859Eea2d5",
    graphqlEndpoint: "https://rootstock.easscan.org/graphql"
  },
  mainnet: {
    contractAddress: "0x54C0726E9d2D57Bc37AD52c7E219A3229e0eE963",
    schemaRegistryAddress: "0xeF29675d82CC5967069d6d9C17F2719f67728F5B",
    graphqlEndpoint: "https://rootstock.easscan.org/graphql"
  }
};

export const DEPLOYMENT_SCHEMA = "string contractName,address contractAddress,address deployer,uint256 blockNumber,bytes32 transactionHash,uint256 timestamp,string abiHash,string bytecodeHash,string version";

export const VERIFICATION_SCHEMA = "string contractName,address contractAddress,address verifier,string sourceCodeHash,string compilationTarget,string compilerVersion,bool optimizationUsed,uint256 timestamp,string verificationTool,string version,string schemaVersion";

export const TRANSFER_SCHEMA = "address sender,address recipient,string amount,address tokenAddress,string tokenSymbol,bytes32 transactionHash,uint256 blockNumber,uint256 timestamp,string reason,string transferType,string version";

export const DEFAULT_SCHEMA_UIDS = {
  testnet: {
    deployment: "0xac72a47948bf42cad950de323c51a0033346629ae4a42da45981ae9748118a72",
    verification: "0xdf68ba5414a61a12f26d41df4f5a1ef3ffe2ab809fea94d9c76fa7cb84b8fb4a",
    transfer: "0x0da2422c401f8810a6be8f4451aaa0c0a5a6601701cba17bba14f50bb0039dc8"
  },
  mainnet: {
    deployment: "",
    verification: "",
    transfer: ""
  }
};

function startSpinner(
  isExternal: boolean,
  spinner: any,
  message: string
) {
  if (!isExternal) {
    spinner.start(message);
  }
}

function updateSpinner(
  isExternal: boolean,
  spinner: any,
  message: string
) {
  if (!isExternal) {
    spinner.text = message;
  }
}

function succeedSpinner(
  isExternal: boolean,
  spinner: any,
  message: string
) {
  if (!isExternal) {
    spinner.succeed(message);
  }
}

function failSpinner(
  isExternal: boolean,
  spinner: any,
  message: string
) {
  if (!isExternal) {
    spinner.fail(message);
  }
}

function warnSpinner(
  isExternal: boolean,
  spinner: any,
  message: string
) {
  if (!isExternal) {
    spinner.warn(message);
  }
}

export class AttestationService {
  private eas: any;
  private config: AttestationConfig;
  private signer: ethers.Signer;
  private easSDK: any;
  private schemaEncoderClass: any;
  private isExternal: boolean;
  private isTestnet: boolean;

  constructor(signer: ethers.Signer, isTestnet: boolean = false, isExternal: boolean = false) {
    this.config = isTestnet ? RSK_ATTESTATION_CONFIG.testnet : RSK_ATTESTATION_CONFIG.mainnet;
    this.signer = signer;
    this.isExternal = isExternal;
    this.isTestnet = isTestnet;
  }

  private async initializeEAS() {
    if (!this.easSDK) {
      try {
        const easSdk = require("@ethereum-attestation-service/eas-sdk");
        this.easSDK = easSdk.EAS;
        this.schemaEncoderClass = easSdk.SchemaEncoder;

        if (!this.easSDK || !this.schemaEncoderClass) {
          throw new Error("Failed to load EAS SDK components");
        }

        this.eas = new this.easSDK(this.config.contractAddress);
        this.eas.connect(this.signer);
      } catch (error) {
        throw new Error(`Failed to initialize EAS SDK: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async createDeploymentAttestation(
    data: DeploymentAttestationData,
    recipient?: string,
    schemaUID?: string
  ): Promise<string> {
    const spinner = this.isExternal ? ora({ isEnabled: false }) : ora();
    startSpinner(this.isExternal, spinner, "Creating deployment attestation...");

    try {
      await this.initializeEAS();
      const schemaEncoder = new this.schemaEncoderClass(DEPLOYMENT_SCHEMA);

      const encodedData = schemaEncoder.encodeData([
        { name: "contractName", value: data.contractName, type: "string" },
        { name: "contractAddress", value: data.contractAddress, type: "address" },
        { name: "deployer", value: data.deployer, type: "address" },
        { name: "blockNumber", value: data.blockNumber, type: "uint256" },
        { name: "transactionHash", value: data.transactionHash, type: "bytes32" },
        { name: "timestamp", value: data.timestamp, type: "uint256" },
        { name: "abiHash", value: data.abiHash || "", type: "string" },
        { name: "bytecodeHash", value: data.bytecodeHash || "", type: "string" },
        { name: "version", value: "1.0", type: "string" }
      ]);

      const attestationData = {
        recipient: recipient || data.contractAddress,
        expirationTime: 0n,
        revocable: true,
        data: encodedData
      };

      if (schemaUID) {
        const tx = await this.eas.attest({
          schema: schemaUID,
          data: attestationData
        });

        updateSpinner(this.isExternal, spinner, "Waiting for attestation confirmation...");
        const receipt = await tx.wait();

        succeedSpinner(this.isExternal, spinner, "✅ Deployment attestation created successfully!");

        logInfo(this.isExternal, `📋 Attestation UID: ${receipt}`);
        const viewerUrl = getAttestationViewerUrl(this.isTestnet, receipt);
        logInfo(this.isExternal, `🔗 View attestation: ${viewerUrl}`);
        logInfo(this.isExternal, `🏠 Contract: ${data.contractAddress}`);
        logInfo(this.isExternal, `👤 Deployer: ${data.deployer}`);

        return receipt;
      } else {
        warnSpinner(this.isExternal, spinner, "⚠️  No schema UID provided, skipping attestation");
        return "";
      }

    } catch (error) {
      failSpinner(this.isExternal, spinner, "❌ Failed to create deployment attestation");
      logError(this.isExternal, `Error: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async verifyAttestation(uid: string): Promise<boolean> {
    const spinner = this.isExternal ? ora({ isEnabled: false }) : ora();
    startSpinner(this.isExternal, spinner, "Verifying attestation...");

    try {
      await this.initializeEAS();
      const attestation = await this.eas.getAttestation(uid);

      if (!attestation) {
        failSpinner(this.isExternal, spinner, "❌ Attestation not found");
        return false;
      }

      const exists = attestation.uid !== "0x0000000000000000000000000000000000000000000000000000000000000000";

      const isRevoked = attestation.revocationTime > 0n;

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const isExpired = attestation.expirationTime > 0n && attestation.expirationTime <= currentTime;

      const isValid = exists && !isRevoked && !isExpired;

      if (isValid) {
        succeedSpinner(this.isExternal, spinner, "✅ Attestation is valid");
        return true;
      } else {
        let reason = "Unknown reason";
        if (!exists) reason = "Attestation does not exist";
        else if (isRevoked) reason = "Attestation has been revoked";
        else if (isExpired) reason = "Attestation has expired";

        failSpinner(this.isExternal, spinner, `❌ Attestation is invalid: ${reason}`);
        return false;
      }

    } catch (error) {
      failSpinner(this.isExternal, spinner, "❌ Failed to verify attestation");
      logError(this.isExternal, `Error: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  static createHash(data: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  async createVerificationAttestation(
    data: VerificationAttestationData,
    recipient?: string,
    schemaUID?: string
  ): Promise<string> {
    const spinner = this.isExternal ? ora({ isEnabled: false }) : ora();
    startSpinner(this.isExternal, spinner, "Creating verification attestation...");

    try {
      await this.initializeEAS();
      const schemaEncoder = new this.schemaEncoderClass(VERIFICATION_SCHEMA);

      const encodedData = schemaEncoder.encodeData([
        { name: "contractName", value: data.contractName, type: "string" },
        { name: "contractAddress", value: data.contractAddress, type: "address" },
        { name: "verifier", value: data.verifier, type: "address" },
        { name: "sourceCodeHash", value: data.sourceCodeHash, type: "string" },
        { name: "compilationTarget", value: data.compilationTarget, type: "string" },
        { name: "compilerVersion", value: data.compilerVersion, type: "string" },
        { name: "optimizationUsed", value: data.optimizationUsed, type: "bool" },
        { name: "timestamp", value: data.timestamp, type: "uint256" },
        { name: "verificationTool", value: data.verificationTool, type: "string" },
        { name: "version", value: "1.0", type: "string" },
        { name: "schemaVersion", value: "2.0", type: "string" }
      ]);

      const attestationData = {
        recipient: recipient || data.contractAddress,
        expirationTime: 0n, 
        revocable: true,
        data: encodedData
      };

      if (schemaUID) {
        const tx = await this.eas.attest({
          schema: schemaUID,
          data: attestationData
        });

        updateSpinner(this.isExternal, spinner, "Waiting for verification attestation confirmation...");
        const receipt = await tx.wait();

        succeedSpinner(this.isExternal, spinner, "✅ Verification attestation created successfully!");

        logInfo(this.isExternal, `📋 Attestation UID: ${receipt}`);
        const viewerUrl = getAttestationViewerUrl(this.isTestnet, receipt);
        logInfo(this.isExternal, `🔗 View attestation: ${viewerUrl}`);
        logInfo(this.isExternal, `🏠 Contract: ${data.contractAddress}`);
        logInfo(this.isExternal, `🔍 Verifier: ${data.verifier}`);
        logInfo(this.isExternal, `🛠️  Tool: ${data.verificationTool}`);

        return receipt;
      } else {
        warnSpinner(this.isExternal, spinner, "⚠️  No schema UID provided, skipping verification attestation");
        return "";
      }

    } catch (error) {
      failSpinner(this.isExternal, spinner, "❌ Failed to create verification attestation");
      logError(this.isExternal, `Error: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async createTransferAttestation(
    data: TransferAttestationData,
    recipient?: string,
    schemaUID?: string
  ): Promise<string> {
    const spinner = this.isExternal ? ora({ isEnabled: false }) : ora();
    startSpinner(this.isExternal, spinner, "Creating transfer attestation...");

    try {
      await this.initializeEAS();
      const schemaEncoder = new this.schemaEncoderClass(TRANSFER_SCHEMA);

      const encodedData = schemaEncoder.encodeData([
        { name: "sender", value: data.sender, type: "address" },
        { name: "recipient", value: data.recipient, type: "address" },
        { name: "amount", value: data.amount, type: "string" },
        { name: "tokenAddress", value: data.tokenAddress || "0x0000000000000000000000000000000000000000", type: "address" },
        { name: "tokenSymbol", value: data.tokenSymbol || "RBTC", type: "string" },
        { name: "transactionHash", value: data.transactionHash, type: "bytes32" },
        { name: "blockNumber", value: data.blockNumber, type: "uint256" },
        { name: "timestamp", value: data.timestamp, type: "uint256" },
        { name: "reason", value: data.reason || "", type: "string" },
        { name: "transferType", value: data.transferType, type: "string" },
        { name: "version", value: "1.0", type: "string" }
      ]);

      const attestationData = {
        recipient: recipient || data.recipient,
        expirationTime: 0n,
        revocable: true,
        data: encodedData
      };

      if (schemaUID) {
        const tx = await this.eas.attest({
          schema: schemaUID,
          data: attestationData
        });

        updateSpinner(this.isExternal, spinner, "Waiting for transfer attestation confirmation...");
        const receipt = await tx.wait();

        succeedSpinner(this.isExternal, spinner, "✅ Transfer attestation created successfully!");

        logInfo(this.isExternal, `📋 Attestation UID: ${receipt}`);
        const viewerUrl = getAttestationViewerUrl(this.isTestnet, receipt);
        logInfo(this.isExternal, `🔗 View attestation: ${viewerUrl}`);
        logInfo(this.isExternal, `💸 Transfer: ${data.amount} ${data.tokenSymbol || 'RBTC'}`);
        logInfo(this.isExternal, `👤 From: ${data.sender}`);
        logInfo(this.isExternal, `👤 To: ${data.recipient}`);
        if (data.reason) {
          logInfo(this.isExternal, `💭 Reason: ${data.reason}`);
        }

        return receipt;
      } else {
        warnSpinner(this.isExternal, spinner, "⚠️  No schema UID provided, skipping transfer attestation");
        return "";
      }

    } catch (error) {
      failSpinner(this.isExternal, spinner, "❌ Failed to create transfer attestation");
      logError(this.isExternal, `Error: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  static async getDefaultSchemaUID(
    isTestnet: boolean = false, 
    type: 'deployment' | 'verification' | 'transfer' = 'deployment'
  ): Promise<string | undefined> {
    const network = isTestnet ? 'testnet' : 'mainnet';
    const uid = DEFAULT_SCHEMA_UIDS[network][type];
    return uid || undefined;
  }
}

export async function createDeploymentAttestation(
  signer: ethers.Signer,
  deploymentData: DeploymentAttestationData,
  options: {
    testnet?: boolean;
    recipient?: string;
    schemaUID?: string;
    enabled?: boolean;
    isExternal?: boolean;
  } = {}
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  try {
    const attestationService = new AttestationService(signer, options.testnet, options.isExternal);

    const schemaUID = options.schemaUID || await AttestationService.getDefaultSchemaUID(options.testnet, 'deployment');

    if (!schemaUID) {
      logInfo(!!options.isExternal, '⚠️  No schema UID provided for deployment attestation');
      logInfo(!!options.isExternal, '   To enable attestations, register a schema matching this structure:');
      logInfo(!!options.isExternal, `   ${DEPLOYMENT_SCHEMA}`);
      logInfo(!!options.isExternal, '   Then use --attest-schema-uid <UID>');
      logInfo(!!options.isExternal, '   See: https://dev.rootstock.io/dev-tools/attestations/ras/');
      return null;
    }

    const uid = await attestationService.createDeploymentAttestation(
      deploymentData,
      options.recipient,
      schemaUID
    );

    return uid;
  } catch (error) {
    logError(!!options.isExternal, `Attestation creation failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function createVerificationAttestation(
  signer: ethers.Signer,
  verificationData: VerificationAttestationData,
  options: {
    testnet?: boolean;
    recipient?: string;
    schemaUID?: string;
    enabled?: boolean;
    isExternal?: boolean;
  } = {}
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  try {
    const attestationService = new AttestationService(signer, options.testnet, options.isExternal);

    const schemaUID = options.schemaUID || await AttestationService.getDefaultSchemaUID(options.testnet, 'verification');

    if (!schemaUID) {
      logInfo(!!options.isExternal, '⚠️  No schema UID provided for verification attestation');
      logInfo(!!options.isExternal, '   To enable attestations, register a schema matching this structure:');
      logInfo(!!options.isExternal, `   ${VERIFICATION_SCHEMA}`);
      logInfo(!!options.isExternal, '   Then use --attest-schema-uid <UID>');
      logInfo(!!options.isExternal, '   See: https://dev.rootstock.io/dev-tools/attestations/ras/');
      return null;
    }

    const uid = await attestationService.createVerificationAttestation(
      verificationData,
      options.recipient,
      schemaUID
    );

    return uid;
  } catch (error) {
    logError(!!options.isExternal, `Verification attestation creation failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function createTransferAttestation(
  signer: ethers.Signer,
  transferData: TransferAttestationData,
  options: {
    testnet?: boolean;
    recipient?: string;
    schemaUID?: string;
    enabled?: boolean;
    isExternal?: boolean;
  } = {}
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  try {
    const attestationService = new AttestationService(signer, options.testnet, options.isExternal);

    const schemaUID = options.schemaUID || await AttestationService.getDefaultSchemaUID(options.testnet, 'transfer');

    if (!schemaUID) {
      logInfo(!!options.isExternal, '⚠️  No schema UID provided for transfer attestation');
      logInfo(!!options.isExternal, '   To enable attestations, register a schema matching this structure:');
      logInfo(!!options.isExternal, `   ${TRANSFER_SCHEMA}`);
      logInfo(!!options.isExternal, '   Then use --attest-schema-uid <UID>');
      logInfo(!!options.isExternal, '   See: https://dev.rootstock.io/dev-tools/attestations/ras/');
      return null;
    }

    const uid = await attestationService.createTransferAttestation(
      transferData,
      options.recipient,
      schemaUID
    );

    return uid;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('0xbf37b20e') || errorMessage.includes('InvalidSchema')) {
      logError(!!options.isExternal, '❌ Invalid or unregistered schema UID');
      logInfo(!!options.isExternal, '   The schema UID provided does not match the transfer data structure');
      logInfo(!!options.isExternal, '   Required schema structure:');
      logInfo(!!options.isExternal, `   ${TRANSFER_SCHEMA}`);
      logInfo(!!options.isExternal, '   Register a schema with this structure at: https://dev.rootstock.io/dev-tools/attestations/ras/');
    } else {
      logError(!!options.isExternal, `Transfer attestation creation failed: ${errorMessage}`);
    }
    return null;
  }
}