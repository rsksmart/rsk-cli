import { z } from "zod";

// GitHub repo format: owner/repo
export const repoSchema = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/, "Repository must be in format: owner/repo");

// Ethereum/Rootstock address format
export const contractAddressSchema = z
  .string()
  .regex(
    /^0x[a-fA-F0-9]{40}$/,
    "Contract address must be a valid Ethereum/Rootstock address (0x followed by 40 hex characters)",
  );

export const outputFormatSchema = z.enum(["table", "json", "markdown"]);

export function validateRepo(repo: string): { valid: boolean; error?: string } {
  try {
    repoSchema.parse(repo);
    return { valid: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.issues[0]?.message ?? "Invalid repository format" };
    }
    return { valid: false, error: "Invalid repository format" };
  }
}

export function validateContractAddress(address: string): { valid: boolean; error?: string } {
  try {
    contractAddressSchema.parse(address);
    return { valid: true };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { valid: false, error: error.issues[0]?.message ?? "Invalid contract address format" };
    }
    return { valid: false, error: "Invalid contract address format" };
  }
}

