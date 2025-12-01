import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import ViemProvider from "../utils/viemProvider.js";
import { AttestationResult } from "../utils/types.js";
import { GraphQLService, AttestationData } from "../utils/graphqlService.js";

type AttestationCommandOptions = {
  testnet: boolean;
  isExternal?: boolean;
  walletName?: string;
  action: 'create' | 'verify' | 'revoke' | 'list' | 'schema';
  recipient?: `0x${string}`;
  schema?: `0x${string}`;
  data?: string;
  uid?: `0x${string}`;
  address?: `0x${string}`;
  schemaString?: string;
  resolverAddress?: `0x${string}`;
  revocable?: boolean;
  attester?: `0x${string}`;
  limit?: number;
};

const EAS_CONTRACTS = {
  mainnet: "0x6C2270298b1e6046898E8908C9171fFf6c2C8F8B" as `0x${string}`,
  testnet: "0x6C2270298b1e6046898E8908C9171fFf6c2C8F8B" as `0x${string}`
};

const SCHEMA_REGISTRY_CONTRACTS = {
  mainnet: "0x55D26f9ae0203EF95494AE4C170eD35f4Cf77797" as `0x${string}`,
  testnet: "0x55D26f9ae0203EF95494AE4C170eD35f4Cf77797" as `0x${string}`
};

function logMessage(
  params: AttestationCommandOptions,
  message: string,
  color: any = chalk.white
) {
  if (!params.isExternal) {
    console.log(color(message));
  }
}

function logError(params: AttestationCommandOptions, message: string) {
  logMessage(params, `❌ ${message}`, chalk.red);
}

function logSuccess(params: AttestationCommandOptions, message: string) {
  logMessage(params, message, chalk.green);
}

function logInfo(params: AttestationCommandOptions, message: string) {
  logMessage(params, message, chalk.blue);
}

function logWarning(params: AttestationCommandOptions, message: string) {
  logMessage(params, message, chalk.yellow);
}

function startSpinner(
  params: AttestationCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.start(message);
  }
}

function stopSpinner(params: AttestationCommandOptions, spinner: any) {
  if (!params.isExternal) {
    spinner.stop();
  }
}

function failSpinner(
  params: AttestationCommandOptions,
  spinner: any,
  message: string
) {
  if (!params.isExternal) {
    spinner.fail(message);
  }
}

async function setupEAS(params: AttestationCommandOptions) {
  const provider = new ViemProvider(params.testnet);
  const walletClient = await provider.getWalletClient(params.walletName);
  
  const easAddress = params.testnet 
    ? EAS_CONTRACTS.testnet 
    : EAS_CONTRACTS.mainnet;
    
  const eas = new EAS(easAddress);
  eas.connect(walletClient as any); 
  
  return { eas, walletClient };
}

async function createAttestation(params: AttestationCommandOptions): Promise<AttestationResult> {
  if (!params.recipient || !params.schema || !params.data) {
    const errorMessage = "Recipient, schema, and data are required for creating attestations.";
    logError(params, errorMessage);
    return { error: errorMessage, success: false };
  }

  const spinner = params.isExternal ? ora({ isEnabled: false }) : ora();
  
  try {
    logInfo(params, `🔧 Creating attestation on ${params.testnet ? "testnet" : "mainnet"}...`);
    startSpinner(params, spinner, "⏳ Setting up EAS connection...");

    const { eas } = await setupEAS(params);
    
    stopSpinner(params, spinner);
    startSpinner(params, spinner, "⏳ Creating attestation...");

    const schemaEncoder = new SchemaEncoder(params.data);
    const encodedData = schemaEncoder.encodeData(JSON.parse(params.data));

    const tx = await eas.attest({
      schema: params.schema,
      data: {
        recipient: params.recipient,
        expirationTime: BigInt(0),
        revocable: true,
        data: encodedData,
      },
    });

    const uid = await tx.wait();
    
    const txHash = (tx as any).hash || 'unknown';
    const explorerUrl = params.testnet
      ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
      : `https://explorer.rootstock.io/tx/${txHash}`;

    stopSpinner(params, spinner);
    logSuccess(params, `✅ Attestation created successfully!`);
    logSuccess(params, `🔗 UID: ${uid}`);
    if (txHash !== 'unknown') {
      logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);
    }

    return {
      success: true,
      data: {
        uid: uid,
        transactionHash: txHash,
        recipient: params.recipient,
        schema: params.schema,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        explorerUrl: txHash !== 'unknown' ? explorerUrl : undefined,
      },
    };
  } catch (error: any) {
    const errorMessage = `Error creating attestation: ${error.message}`;
    failSpinner(params, spinner, errorMessage);
    return { error: errorMessage, success: false };
  }
}

async function verifyAttestation(params: AttestationCommandOptions): Promise<AttestationResult> {
  if (!params.uid) {
    const errorMessage = "UID is required for verifying attestations.";
    logError(params, errorMessage);
    return { error: errorMessage, success: false };
  }

  const spinner = params.isExternal ? ora({ isEnabled: false }) : ora();
  
  try {
    logInfo(params, `🔧 Verifying attestation on ${params.testnet ? "testnet" : "mainnet"}...`);
    startSpinner(params, spinner, "⏳ Setting up EAS connection...");

    const { eas } = await setupEAS(params);
    
    stopSpinner(params, spinner);
    startSpinner(params, spinner, "⏳ Fetching attestation...");

    const attestation = await eas.getAttestation(params.uid);

    stopSpinner(params, spinner);
    logSuccess(params, `✅ Attestation verified successfully!`);
    logInfo(params, `🆔 UID: ${attestation.uid}`);
    logInfo(params, `👤 Attester: ${attestation.attester}`);
    logInfo(params, `👥 Recipient: ${attestation.recipient}`);
    logInfo(params, `📋 Schema: ${attestation.schema}`);
    logInfo(params, `⏰ Time: ${new Date(Number(attestation.time) * 1000).toISOString()}`);
    logInfo(params, `🔄 Revocable: ${attestation.revocable}`);
    logInfo(params, `🚫 Revoked: ${Number(attestation.revocationTime) > 0}`);

    return {
      success: true,
      data: {
        uid: params.uid,
        attestation: attestation,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
      },
    };
  } catch (error: any) {
    const errorMessage = `Error verifying attestation: ${error.message}`;
    failSpinner(params, spinner, errorMessage);
    return { error: errorMessage, success: false };
  }
}

async function revokeAttestation(params: AttestationCommandOptions): Promise<AttestationResult> {
  if (!params.uid || !params.schema) {
    const errorMessage = "UID and schema are required for revoking attestations.";
    logError(params, errorMessage);
    return { error: errorMessage, success: false };
  }

  const spinner = params.isExternal ? ora({ isEnabled: false }) : ora();
  
  try {
    logInfo(params, `🔧 Revoking attestation on ${params.testnet ? "testnet" : "mainnet"}...`);
    startSpinner(params, spinner, "⏳ Setting up EAS connection...");

    const { eas } = await setupEAS(params);
    
    stopSpinner(params, spinner);
    startSpinner(params, spinner, "⏳ Revoking attestation...");

    const tx = await eas.revoke({
      schema: params.schema,
      data: { uid: params.uid }
    });

    const receipt = await tx.wait();
    
    const txHash = (tx as any).hash || (receipt as any)?.transactionHash || (receipt as any)?.hash || 'unknown';
    const explorerUrl = params.testnet
      ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
      : `https://explorer.rootstock.io/tx/${txHash}`;

    stopSpinner(params, spinner);
    logSuccess(params, `✅ Attestation revoked successfully!`);
    if (txHash !== 'unknown') {
      logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);
    }

    return {
      success: true,
      data: {
        uid: params.uid,
        transactionHash: txHash,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        explorerUrl: txHash !== 'unknown' ? explorerUrl : undefined,
      },
    };
  } catch (error: any) {
    const errorMessage = `Error revoking attestation: ${error.message}`;
    failSpinner(params, spinner, errorMessage);
    return { error: errorMessage, success: false };
  }
}

async function listAttestations(params: AttestationCommandOptions): Promise<AttestationResult> {
  const spinner = params.isExternal ? ora({ isEnabled: false }) : ora();
  
  try {
    logInfo(params, `📋 Listing attestations on ${params.testnet ? "testnet" : "mainnet"}...`);
    startSpinner(params, spinner, "⏳ Querying attestations...");

    const graphqlService = new GraphQLService(params.testnet);
    
    const filters: {
      recipient?: string;
      attester?: string;
      schema?: string;
      limit?: number;
    } = {};
    
    if (params.address) filters.recipient = params.address;
    if (params.attester) filters.attester = params.attester;
    if (params.schema) filters.schema = params.schema;
    if (params.limit) filters.limit = params.limit;
    
    const attestations = await graphqlService.queryAttestations(filters);
    
    stopSpinner(params, spinner);
    logSuccess(params, `✅ Found ${attestations.length} attestations`);
    
    if (attestations.length === 0) {
      logInfo(params, "No attestations found matching your criteria.");
    } else {
      attestations.forEach((attestation, index) => {
        logInfo(params, `\n📄 Attestation ${index + 1}:`);
        logInfo(params, `   🆔 UID: ${attestation.uid}`);
        logInfo(params, `   👤 Attester: ${attestation.attester}`);
        logInfo(params, `   👥 Recipient: ${attestation.recipient}`);
        logInfo(params, `   📋 Schema: ${attestation.schema}`);
        logInfo(params, `   ⏰ Time: ${new Date(attestation.time * 1000).toISOString()}`);
        logInfo(params, `   🔄 Revocable: ${attestation.revocable}`);
        logInfo(params, `   🚫 Revoked: ${attestation.revocationTime > 0}`);
      });
    }

    return {
      success: true,
      data: {
        attestations: attestations,
        count: attestations.length,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
      },
    };
  } catch (error: any) {
    const errorMessage = `Error listing attestations: ${error.message}`;
    failSpinner(params, spinner, errorMessage);
    return { error: errorMessage, success: false };
  }
}

async function createSchema(params: AttestationCommandOptions): Promise<AttestationResult> {
  if (!params.schemaString || params.revocable === undefined) {
    const errorMessage = "Schema string and revocable flag are required for creating schemas.";
    logError(params, errorMessage);
    return { error: errorMessage, success: false };
  }

  const spinner = params.isExternal ? ora({ isEnabled: false }) : ora();
  
  try {
    logInfo(params, `🔧 Creating schema on ${params.testnet ? "testnet" : "mainnet"}...`);
    startSpinner(params, spinner, "⏳ Setting up EAS connection...");

    const { eas } = await setupEAS(params);
    
    stopSpinner(params, spinner);
    startSpinner(params, spinner, "⏳ Creating schema...");

    const schemaRegistryAddress = params.testnet 
      ? SCHEMA_REGISTRY_CONTRACTS.testnet
      : SCHEMA_REGISTRY_CONTRACTS.mainnet;
    
    const schemaRegistry = await (eas as any).getSchemaRegistry();
    
    const tx = await schemaRegistry.register(
      params.schemaString,
      params.resolverAddress || "0x0000000000000000000000000000000000000000",
      params.revocable
    );

    const receipt = await tx.wait();
    
    const txHash = (tx as any).hash || (receipt as any)?.transactionHash || (receipt as any)?.hash || 'unknown';
    
    let schemaUID = 'unknown';
    try {
      schemaUID = await (tx as any).getSchemaUID?.() || 'unknown';
    } catch (e) {
    }
    
    const explorerUrl = params.testnet
      ? `https://explorer.testnet.rootstock.io/tx/${txHash}`
      : `https://explorer.rootstock.io/tx/${txHash}`;

    stopSpinner(params, spinner);
    logSuccess(params, `✅ Schema created successfully!`);
    logSuccess(params, `🔗 Schema UID: ${schemaUID}`);
    if (txHash !== 'unknown') {
      logInfo(params, `🔗 View on Explorer: ${explorerUrl}`);
    }
    logInfo(params, `📋 Schema: ${params.schemaString}`);
    logInfo(params, `🔄 Revocable: ${params.revocable}`);

    return {
      success: true,
      data: {
        uid: schemaUID,
        transactionHash: txHash,
        schema: params.schemaString,
        revocable: params.revocable,
        network: params.testnet ? "Rootstock Testnet" : "Rootstock Mainnet",
        explorerUrl: txHash !== 'unknown' ? explorerUrl : undefined,
      },
    };
  } catch (error: any) {
    const errorMessage = `Error creating schema: ${error.message}`;
    failSpinner(params, spinner, errorMessage);
    return { error: errorMessage, success: false };
  }
}

export async function attestationCommand(
  params: AttestationCommandOptions
): Promise<AttestationResult | void> {
  switch (params.action) {
    case 'create':
      return await createAttestation(params);
    case 'verify':
      return await verifyAttestation(params);
    case 'revoke':
      return await revokeAttestation(params);
    case 'list':
      return await listAttestations(params);
    case 'schema':
      return await createSchema(params);
    default:
      const errorMessage = `Unknown action: ${params.action}`;
      logError(params, errorMessage);
      return { error: errorMessage, success: false };
  }
}