import { describe, expect, it, vi } from "vitest";

vi.mock("../src/services/devmetrics/githubService.js", () => {
  return {
    GitHubService: class {
      isAuthenticated() {
        return true;
      }
      async getMetrics(owner: string, repo: string) {
        return {
          stars: 1,
          lastCommitDate: "2024-01-01T00:00:00.000Z",
          openIssuesCount: 2,
          pullRequestsCount: 3,
          contributorCount: 4,
          repository: `${owner}/${repo}`,
        };
      }
    },
  };
});

vi.mock("../src/services/devmetrics/rootstockService.js", () => {
  class MockRootstockService {
    static async create() {
      return new MockRootstockService();
    }

    getRedactedRpcUrl() {
      return "https://public-node.rsk.co";
    }

    async getMetrics(contractAddress: string) {
      return {
        contractAddress,
        deploymentBlock: 1,
        totalTransactionCount: 1,
        lastTransactionTimestamp: "2024-01-01T00:00:00.000Z",
        gasUsagePatterns: { average: 1, min: 1, max: 1 },
      };
    }
  }

  return {
    RootstockService: MockRootstockService,
  };
});

vi.mock("../src/utils/devmetrics/rpcUrl.js", () => {
  return {
    validateRpcUrl: async () => new URL("https://public-node.rsk.co"),
    redactRpcUrl: () => "https://public-node.rsk.co",
  };
});

import { devMetricsCommand } from "../src/commands/devmetrics.js";

describe("devmetrics orchestration", () => {
  it("returns success for valid single pair", async () => {
    const result = await devMetricsCommand({
      repo: ["acme/repo"],
      contract: ["0x1234567890abcdef1234567890abcdef12345678"],
      network: "mainnet",
      ci: true,
      isExternal: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.reports.length).toBe(1);
  });

  it("fails fast for invalid input", async () => {
    const result = await devMetricsCommand({
      repo: [],
      contract: ["0x1234567890abcdef1234567890abcdef12345678"],
      ci: true,
      isExternal: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("--repo");
  });

  it("fails fast for malformed github token", async () => {
    const result = await devMetricsCommand({
      repo: ["acme/repo"],
      contract: ["0x1234567890abcdef1234567890abcdef12345678"],
      githubToken: "bad token",
      ci: true,
      isExternal: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid --github-token format");
  });
});
