import {
  createDeploymentAttestation,
  createTransferAttestation,
  createVerificationAttestation,
  DeploymentAttestationData,
  TransferAttestationData,
  VerificationAttestationData
} from "./attestation.js";
import { createAttestationSigner } from "./walletSigner.js";
import { logError, logSuccess, logInfo, capitalize } from "./logger.js";
import { UNKNOWN_ERROR_MESSAGE, getAttestationViewerUrl } from "./constants.js";
import { ethers } from "ethers";

export interface BaseAttestationOptions {
  enabled: boolean;
  testnet?: boolean;
  schemaUID?: string;
  recipient?: string;
  isExternal?: boolean;
  walletName?: string;
  walletsData?: any;
  password?: string;
}

export interface AttestationHandlerResult {
  uid: string | null;
  success: boolean;
  error?: string;
}

function buildAttestationOptions(options: BaseAttestationOptions) {
  return {
    testnet: options.testnet,
    recipient: options.recipient,
    schemaUID: options.schemaUID,
    enabled: true,
    isExternal: options.isExternal
  };
}

async function prepareVerificationData(
  data: VerificationAttestationData,
  signer: ethers.Signer
): Promise<VerificationAttestationData> {
  if (!data.verifier) {
    data.verifier = await signer.getAddress();
  }
  return data;
}

async function dispatchAttestation(
  attestationType: 'deployment' | 'transfer' | 'verification',
  signer: ethers.Signer,
  attestationData: DeploymentAttestationData | TransferAttestationData | VerificationAttestationData,
  attestationOptions: any
): Promise<string | null> {
  switch (attestationType) {
    case 'deployment':
      return await createDeploymentAttestation(
        signer,
        attestationData as DeploymentAttestationData,
        attestationOptions
      );
    case 'transfer':
      return await createTransferAttestation(
        signer,
        attestationData as TransferAttestationData,
        attestationOptions
      );
    case 'verification': {
      const verificationData = await prepareVerificationData(
        attestationData as VerificationAttestationData,
        signer
      );
      return await createVerificationAttestation(
        signer,
        verificationData,
        attestationOptions
      );
    }
  }
}

function formatAttestationError(attestationType: string, error: unknown): string {
  const message = error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE;
  return `⚠️  ${capitalize(attestationType)} attestation creation failed: ${message}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE;
}

export async function handleAttestation<T extends DeploymentAttestationData | TransferAttestationData | VerificationAttestationData>(
  attestationType: 'deployment' | 'transfer' | 'verification',
  attestationData: T,
  options: BaseAttestationOptions
): Promise<AttestationHandlerResult> {
  const isExternal = options.isExternal || false;

  if (!options.enabled) {
    return { uid: null, success: true };
  }

  try {
    logInfo(isExternal, `🔐 Creating ${attestationType} attestation...`);

    const signer = await createAttestationSigner({
      testnet: options.testnet,
      walletName: options.walletName,
      isExternal: options.isExternal,
      walletsData: options.walletsData,
      password: options.password
    });

    if (!signer) {
      logInfo(isExternal, `⚠️  Unable to create wallet signer for ${attestationType} attestation, skipping`);
      return { uid: null, success: true };
    }

    const attestationOptions = buildAttestationOptions(options);
    const attestationUID = await dispatchAttestation(
      attestationType,
      signer,
      attestationData,
      attestationOptions
    );

    if (attestationUID) {
      logSuccess(isExternal, `🎯 ${capitalize(attestationType)} attestation created: ${attestationUID}`);
      const viewerUrl = getAttestationViewerUrl(options.testnet || false, attestationUID);
      logInfo(isExternal, `🔗 View attestation: ${viewerUrl}`);
      return { uid: attestationUID, success: true };
    }

    return { uid: null, success: true };
  } catch (attestationError) {
    const errorMessage = formatAttestationError(attestationType, attestationError);
    logError(isExternal, errorMessage);
    return {
      uid: null,
      success: false,
      error: getErrorMessage(attestationError)
    };
  }
}
