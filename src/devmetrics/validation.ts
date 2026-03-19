import type { OutputFormat } from "./types.js";

const REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const VALID_FORMATS: OutputFormat[] = ["table", "json", "markdown"];

export function validateRepo(repo: string): { valid: boolean; error?: string } {
  if (!REPO_RE.test(repo)) {
    return {
      valid: false,
      error: 'Repository must be in "owner/repo" format (e.g. rsksmart/rsk-cli)',
    };
  }
  return { valid: true };
}

export function validateContractAddress(address: string): { valid: boolean; error?: string } {
  if (!ADDR_RE.test(address)) {
    return {
      valid: false,
      error: "Contract address must start with 0x followed by 40 hex characters",
    };
  }
  return { valid: true };
}

export function validateOutputFormat(format: string): format is OutputFormat {
  return VALID_FORMATS.includes(format as OutputFormat);
}
