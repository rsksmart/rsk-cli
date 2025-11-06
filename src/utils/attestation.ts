// Dynamic import for EAS SDK to handle module compatibility issues
import { ethers } from "ethers";
import chalk from "chalk";
import ora from "ora";

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
    contractAddress: "0x54c0726E9D2D57Bc37aD52C7E219a3229E0ee963",
    schemaRegistryAddress: "0xef29675d82Cc5967069D6D9c17F2719F67728F5b",
    graphqlEndpoint: "https://rootstock.easscan.org/graphql"
  },
  mainnet: {
    contractAddress: "0x54c0726E9D2D57Bc37aD52C7E219a3229E0ee963",
    schemaRegistryAddress: "0xef29675d82Cc5967069D6D9c17F2719F67728F5b", 
    graphqlEndpoint: "https://rootstock.easscan.org/graphql"
  }
};

export const DEPLOYMENT_SCHEMA = "string contractName,address contractAddress,address deployer,uint256 blockNumber,bytes32 transactionHash,uint256 timestamp,string abiHash,string bytecodeHash";

export const VERIFICATION_SCHEMA = "string contractName,address contractAddress,address verifier,string sourceCodeHash,string compilationTarget,string compilerVersion,bool optimizationUsed,uint256 timestamp,string verificationTool";

export const TRANSFER_SCHEMA = "address sender,address recipient,string amount,address tokenAddress,string tokenSymbol,bytes32 transactionHash,uint256 blockNumber,uint256 timestamp,string reason,string transferType";

export class AttestationService {
  private eas: any;
  private config: AttestationConfig;
  private signer: ethers.Signer;
  private easSDK: any;
  private schemaEncoderClass: any;

  constructor(signer: ethers.Signer, isTestnet: boolean = false) {
    this.config = isTestnet ? RSK_ATTESTATION_CONFIG.testnet : RSK_ATTESTATION_CONFIG.mainnet;
    this.signer = signer;
  }

  private async initializeEAS() {
    if (!this.easSDK) {
      try {
        // Dynamic import to handle module compatibility
        const easSdk = await import("@ethereum-attestation-service/eas-sdk");
        this.easSDK = easSdk.EAS || easSdk.default?.EAS;
        this.schemaEncoderClass = easSdk.SchemaEncoder || easSdk.default?.SchemaEncoder;
        
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
    const spinner = ora("Creating deployment attestation...").start();
    
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
        { name: "bytecodeHash", value: data.bytecodeHash || "", type: "string" }
      ]);

      const attestationData = {
        recipient: recipient || data.contractAddress,
        expirationTime: 0n, // No expiration
        revocable: true,
        data: encodedData
      };

      if (schemaUID) {
        const tx = await this.eas.attest({
          schema: schemaUID,
          data: attestationData
        });

        spinner.text = "Waiting for attestation confirmation...";
        const receipt = await tx.wait();
        
        spinner.succeed(chalk.green("✅ Deployment attestation created successfully!"));
        
        console.log(chalk.cyan(`📋 Attestation UID: ${receipt}`));
        console.log(chalk.cyan(`🏠 Contract: ${data.contractAddress}`));
        console.log(chalk.cyan(`👤 Deployer: ${data.deployer}`));
        
        return receipt;
      } else {
        spinner.warn(chalk.yellow("⚠️  No schema UID provided, skipping attestation"));
        return "";
      }
      
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to create deployment attestation"));
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      throw error;
    }
  }

  async verifyAttestation(uid: string): Promise<boolean> {
    const spinner = ora("Verifying attestation...").start();
    
    try {
      await this.initializeEAS();
      const attestation = await this.eas.getAttestation(uid);
      
      if (!attestation) {
        spinner.fail(chalk.red("❌ Attestation not found"));
        return false;
      }

      // Check if attestation exists (uid is not zero)
      const exists = attestation.uid !== "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      // Check revocation status (using revocationTime instead of revoked)
      const isRevoked = attestation.revocationTime > 0n;
      
      // Check expiration (expirationTime 0 means never expires)
      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const isExpired = attestation.expirationTime > 0n && attestation.expirationTime <= currentTime;
      
      const isValid = exists && !isRevoked && !isExpired;
      
      if (isValid) {
        spinner.succeed(chalk.green("✅ Attestation is valid"));
        return true;
      } else {
        let reason = "Unknown reason";
        if (!exists) reason = "Attestation does not exist";
        else if (isRevoked) reason = "Attestation has been revoked";
        else if (isExpired) reason = "Attestation has expired";
        
        spinner.fail(chalk.red(`❌ Attestation is invalid: ${reason}`));
        return false;
      }
      
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to verify attestation"));
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
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
    const spinner = ora("Creating verification attestation...").start();
    
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
        { name: "verificationTool", value: data.verificationTool, type: "string" }
      ]);

      const attestationData = {
        recipient: recipient || data.contractAddress,
        expirationTime: 0n, // No expiration
        revocable: true,
        data: encodedData
      };

      if (schemaUID) {
        const tx = await this.eas.attest({
          schema: schemaUID,
          data: attestationData
        });

        spinner.text = "Waiting for verification attestation confirmation...";
        const receipt = await tx.wait();
        
        spinner.succeed(chalk.green("✅ Verification attestation created successfully!"));
        
        console.log(chalk.cyan(`📋 Attestation UID: ${receipt}`));
        console.log(chalk.cyan(`🏠 Contract: ${data.contractAddress}`));
        console.log(chalk.cyan(`🔍 Verifier: ${data.verifier}`));
        console.log(chalk.cyan(`🛠️  Tool: ${data.verificationTool}`));
        
        return receipt;
      } else {
        spinner.warn(chalk.yellow("⚠️  No schema UID provided, skipping verification attestation"));
        return "";
      }
      
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to create verification attestation"));
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      throw error;
    }
  }

  async createTransferAttestation(
    data: TransferAttestationData,
    recipient?: string,
    schemaUID?: string
  ): Promise<string> {
    const spinner = ora("Creating transfer attestation...").start();
    
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
        { name: "transferType", value: data.transferType, type: "string" }
      ]);

      const attestationData = {
        recipient: recipient || data.recipient,
        expirationTime: 0n, // No expiration
        revocable: true,
        data: encodedData
      };

      if (schemaUID) {
        const tx = await this.eas.attest({
          schema: schemaUID,
          data: attestationData
        });

        spinner.text = "Waiting for transfer attestation confirmation...";
        const receipt = await tx.wait();
        
        spinner.succeed(chalk.green("✅ Transfer attestation created successfully!"));
        
        console.log(chalk.cyan(`📋 Attestation UID: ${receipt}`));
        console.log(chalk.cyan(`💸 Transfer: ${data.amount} ${data.tokenSymbol || 'RBTC'}`));
        console.log(chalk.cyan(`👤 From: ${data.sender}`));
        console.log(chalk.cyan(`👤 To: ${data.recipient}`));
        if (data.reason) {
          console.log(chalk.cyan(`💭 Reason: ${data.reason}`));
        }
        
        return receipt;
      } else {
        spinner.warn(chalk.yellow("⚠️  No schema UID provided, skipping transfer attestation"));
        return "";
      }
      
    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to create transfer attestation"));
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      throw error;
    }
  }

  static async getDefaultSchemaUID(isTestnet: boolean = false, type: 'deployment' | 'verification' | 'transfer' = 'deployment'): Promise<string> {
    // This would typically query the schema registry for the schema UID
    // For now, return placeholders that would be the actual UIDs after schema registration
    if (type === 'verification') {
      return "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    } else if (type === 'transfer') {
      return "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
    }
    return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
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
  } = {}
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  try {
    const attestationService = new AttestationService(signer, options.testnet);
    
    const schemaUID = options.schemaUID || await AttestationService.getDefaultSchemaUID(options.testnet, 'deployment');
    
    const uid = await attestationService.createDeploymentAttestation(
      deploymentData,
      options.recipient,
      schemaUID
    );

    return uid;
  } catch (error) {
    console.error(chalk.red("Attestation creation failed:"), error instanceof Error ? error.message : error);
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
  } = {}
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  try {
    const attestationService = new AttestationService(signer, options.testnet);
    
    const schemaUID = options.schemaUID || await AttestationService.getDefaultSchemaUID(options.testnet, 'verification');
    
    const uid = await attestationService.createVerificationAttestation(
      verificationData,
      options.recipient,
      schemaUID
    );

    return uid;
  } catch (error) {
    console.error(chalk.red("Verification attestation creation failed:"), error instanceof Error ? error.message : error);
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
  } = {}
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  try {
    const attestationService = new AttestationService(signer, options.testnet);
    
    const schemaUID = options.schemaUID || await AttestationService.getDefaultSchemaUID(options.testnet, 'transfer');
    
    const uid = await attestationService.createTransferAttestation(
      transferData,
      options.recipient,
      schemaUID
    );

    return uid;
  } catch (error) {
    console.error(chalk.red("Transfer attestation creation failed:"), error instanceof Error ? error.message : error);
    return null;
  }
}