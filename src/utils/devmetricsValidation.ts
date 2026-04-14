// GitHub repo format: owner/repo
const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

// Ethereum/Rootstock address: 0x followed by 40 hex chars
const CONTRACT_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function validateRepo(repo: string): { valid: boolean; error?: string } {
  if (!REPO_REGEX.test(repo)) {
    return {
      valid: false,
      error: "Repository must be in format: owner/repo",
    };
  }
  return { valid: true };
}

export function validateContractAddress(address: string): {
  valid: boolean;
  error?: string;
} {
  if (!CONTRACT_ADDRESS_REGEX.test(address)) {
    return {
      valid: false,
      error:
        "Contract address must be a valid Ethereum/Rootstock address (0x followed by 40 hex characters)",
    };
  }
  return { valid: true };
}
