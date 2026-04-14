import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { devmetricsCommand } from "../../commands/devmetrics.js";

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockGetMetricsGitHub = vi.fn();
const mockGetMetricsRootstock = vi.fn();
const mockIsAuthenticated = vi.fn().mockReturnValue(true);
const mockGetRateLimitStatus = vi.fn().mockResolvedValue({
  remaining: 4999,
  limit: 5000,
  resetAt: new Date(),
});
const mockGetNetwork = vi.fn().mockReturnValue("mainnet");
const mockGetRpcUrl = vi.fn().mockReturnValue("https://public-node.rsk.co");

vi.mock("../../services/github.service.js", () => ({
  GitHubService: vi.fn().mockImplementation(function () {
    return {
      getMetrics: mockGetMetricsGitHub,
      isAuthenticated: mockIsAuthenticated,
      getRateLimitStatus: mockGetRateLimitStatus,
    };
  }),
}));

vi.mock("../../services/rootstock.service.js", () => ({
  RootstockService: vi.fn().mockImplementation(function () {
    return {
      getMetrics: mockGetMetricsRootstock,
      getNetwork: mockGetNetwork,
      getRpcUrl: mockGetRpcUrl,
    };
  }),
}));

const mockFormatReport = vi.fn().mockReturnValue("[formatted report]");

vi.mock("../../formatters/devmetrics/index.js", () => ({
  formatReport: (...args: any[]) => mockFormatReport(...args),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GITHUB_METRICS = {
  stars: 42,
  lastCommitDate: "2026-04-06T10:00:00Z",
  openIssuesCount: 5,
  pullRequestsCount: 2,
  contributorCount: 10,
  repository: "rsksmart/rsk-cli",
};

const ROOTSTOCK_METRICS = {
  contractAddress: "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d",
  deploymentBlock: 5000000,
  totalTransactionCount: 123,
  lastTransactionTimestamp: "2026-04-10T08:00:00.000Z",
  gasUsagePatterns: { average: 21000, min: 21000, max: 50000 },
};

const VALID_REPO = "rsksmart/rsk-cli";
const VALID_CONTRACT = "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spyExit() {
  return vi.spyOn(process, "exit").mockImplementation((_code?: any) => {
    throw new Error(`process.exit(${_code ?? ""})`);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("devmetricsCommand (integration)", () => {
  let exitSpy: ReturnType<typeof spyExit>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMetricsGitHub.mockResolvedValue(GITHUB_METRICS);
    mockGetMetricsRootstock.mockResolvedValue(ROOTSTOCK_METRICS);
    mockIsAuthenticated.mockReturnValue(true);
    mockGetRateLimitStatus.mockResolvedValue({
      remaining: 4999,
      limit: 5000,
      resetAt: new Date(),
    });
    exitSpy = spyExit();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("calls GitHubService.getMetrics with owner and repo name", async () => {
    await devmetricsCommand({
      repos: [VALID_REPO],
      contracts: [VALID_CONTRACT],
    });
    expect(mockGetMetricsGitHub).toHaveBeenCalledWith("rsksmart", "rsk-cli");
  });

  it("calls RootstockService.getMetrics with the contract address", async () => {
    await devmetricsCommand({
      repos: [VALID_REPO],
      contracts: [VALID_CONTRACT],
    });
    expect(mockGetMetricsRootstock).toHaveBeenCalledWith(VALID_CONTRACT);
  });

  it("calls formatReport with the assembled reports array and correct format", async () => {
    await devmetricsCommand({
      repos: [VALID_REPO],
      contracts: [VALID_CONTRACT],
      format: "json",
    });
    expect(mockFormatReport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          repository: VALID_REPO,
          contractAddress: VALID_CONTRACT,
          github: expect.objectContaining({ stars: 42 }),
          rootstock: expect.objectContaining({ deploymentBlock: 5000000 }),
        }),
      ]),
      "json"
    );
  });

  it("forces JSON format when --ci flag is set", async () => {
    await devmetricsCommand({
      repos: [VALID_REPO],
      contracts: [VALID_CONTRACT],
      ci: true,
      format: "table",
    });
    expect(mockFormatReport).toHaveBeenCalledWith(
      expect.any(Array),
      "json"
    );
  });

  it("fan-out: applies one contract to multiple repos", async () => {
    await devmetricsCommand({
      repos: [VALID_REPO, "rsksmart/rif-wallet"],
      contracts: [VALID_CONTRACT],
    });
    expect(mockGetMetricsGitHub).toHaveBeenCalledTimes(2);
    expect(mockGetMetricsRootstock).toHaveBeenCalledTimes(2);
    expect(mockFormatReport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ repository: VALID_REPO }),
        expect.objectContaining({ repository: "rsksmart/rif-wallet" }),
      ]),
      "table"
    );
  });

  it("fan-out: applies one repo to multiple contracts", async () => {
    const second = "0xabcdef1234567890abcdef1234567890abcdef12";
    await devmetricsCommand({
      repos: [VALID_REPO],
      contracts: [VALID_CONTRACT, second],
    });
    expect(mockGetMetricsRootstock).toHaveBeenCalledWith(VALID_CONTRACT);
    expect(mockGetMetricsRootstock).toHaveBeenCalledWith(second);
  });

  it("passes githubToken to GitHubService constructor", async () => {
    const { GitHubService } = await import("../../services/github.service.js");
    await devmetricsCommand({
      repos: [VALID_REPO],
      contracts: [VALID_CONTRACT],
      githubToken: "ghp_secret",
    });
    expect(GitHubService).toHaveBeenCalledWith("ghp_secret");
  });

  // ── Validation / exit paths ──────────────────────────────────────────────────

  it("exits 1 when no repos are supplied", async () => {
    await expect(
      devmetricsCommand({ repos: [], contracts: [VALID_CONTRACT] })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when no contracts are supplied", async () => {
    await expect(
      devmetricsCommand({ repos: [VALID_REPO], contracts: [] })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when a repo has an invalid format", async () => {
    await expect(
      devmetricsCommand({
        repos: ["invalid-repo-without-slash"],
        contracts: [VALID_CONTRACT],
      })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when a contract address is invalid", async () => {
    await expect(
      devmetricsCommand({
        repos: [VALID_REPO],
        contracts: ["not-an-address"],
      })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when --network has an unsupported value", async () => {
    await expect(
      devmetricsCommand({
        repos: [VALID_REPO],
        contracts: [VALID_CONTRACT],
        network: "polygon" as any,
      })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when --format has an unsupported value", async () => {
    await expect(
      devmetricsCommand({
        repos: [VALID_REPO],
        contracts: [VALID_CONTRACT],
        format: "xml" as any,
      })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when --rpc-url uses a non-http protocol", async () => {
    await expect(
      devmetricsCommand({
        repos: [VALID_REPO],
        contracts: [VALID_CONTRACT],
        rpcUrl: "file:///etc/passwd",
      })
    ).rejects.toThrow("process.exit(1)");
  });

  it("exits 1 when repo/contract counts are mismatched (multiple each)", async () => {
    await expect(
      devmetricsCommand({
        repos: [VALID_REPO, "rsksmart/rif-wallet"],
        contracts: [VALID_CONTRACT, "0xabcdef1234567890abcdef1234567890abcdef12", "0xaaaa00000000000000000000000000000000aaaa"],
      })
    ).rejects.toThrow("process.exit(1)");
  });

  // ── Error handling per pair ───────────────────────────────────────────────────

  it("exits 1 when all pairs fail, without calling formatReport", async () => {
    mockGetMetricsGitHub.mockRejectedValue(new Error("GitHub API down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      devmetricsCommand({
        repos: [VALID_REPO],
        contracts: [VALID_CONTRACT],
      })
    ).rejects.toThrow("process.exit(1)");
    expect(mockFormatReport).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("still outputs a partial report when only some pairs fail", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetMetricsGitHub
      .mockResolvedValueOnce(GITHUB_METRICS)
      .mockRejectedValueOnce(new Error("not found"));

    await expect(
      devmetricsCommand({
        repos: [VALID_REPO, "rsksmart/nonexistent"],
        contracts: [VALID_CONTRACT],
      })
    ).rejects.toThrow("process.exit(1)");

    // formatReport should have been called with the single successful report
    expect(mockFormatReport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ repository: VALID_REPO }),
      ]),
      "table"
    );
    errSpy.mockRestore();
  });

  it("outputs errors as JSON when CI mode is enabled and pairs fail", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetMetricsGitHub.mockRejectedValue(new Error("GitHub down"));

    await expect(
      devmetricsCommand({
        repos: [VALID_REPO],
        contracts: [VALID_CONTRACT],
        ci: true,
      })
    ).rejects.toThrow("process.exit(1)");

    const [jsonArg] = errSpy.mock.calls[0] as [string];
    expect(() => JSON.parse(jsonArg)).not.toThrow();
    expect(JSON.parse(jsonArg)).toHaveProperty("errors");
    errSpy.mockRestore();
  });
});
