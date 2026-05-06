import { describe, expect, it } from "vitest";
import { GitHubService } from "../src/services/devmetrics/githubService.js";
import { RootstockService } from "../src/services/devmetrics/rootstockService.js";

describe("devmetrics services", () => {
  it("fetches GitHub metrics from mocked octokit", async () => {
    const svc = new GitHubService("token");
    (svc as any).octokit = {
      repos: {
        get: async () => ({ data: { stargazers_count: 10, open_issues_count: 5 } }),
        listCommits: async () => ({ data: [{ commit: { committer: { date: "2024-01-01T00:00:00.000Z" } } }] }),
        listContributors: async () => ({ data: [{}, {}] }),
      },
      pulls: {
        list: async () => ({ data: [{}] }),
      },
      search: {
        issuesAndPullRequests: async () => ({ data: { total_count: 3 } }),
      },
    };

    const res = await svc.getMetrics("acme", "repo");
    expect(res.repository).toBe("acme/repo");
    expect(res.stars).toBe(10);
    expect(res.pullRequestsCount).toBe(3);
  });

  it("fetches Rootstock metrics from mocked client", async () => {
    const svc = await RootstockService.create("https://public-node.rsk.co", "mainnet");
    (svc as any).client = {
      getBlockNumber: async () => 1000n,
      getBytecode: async () => "0x1234",
      getBlock: async () => ({
        timestamp: 1700000000n,
        transactions: [{ hash: "0xabc", to: "0x1234567890abcdef1234567890abcdef12345678" }],
      }),
      getTransactionReceipt: async () => ({ gasUsed: 21000n }),
    };

    const res = await svc.getMetrics("0x1234567890abcdef1234567890abcdef12345678");
    expect(res.contractAddress.toLowerCase()).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(res.gasUsagePatterns.average).toBeGreaterThanOrEqual(0);
  });
});
