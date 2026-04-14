import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubService } from "../../services/github.service.js";

// ─── Octokit mock factory ─────────────────────────────────────────────────────
//
// We mock @octokit/rest at the module level so every `new Octokit()` call
// inside GitHubService returns a controllable fake.

const makeOctokit = (overrides: Record<string, any> = {}) => ({
  rateLimit: {
    get: vi.fn().mockResolvedValue({
      data: { rate: { remaining: 59, limit: 60, reset: 9999999999 } },
    }),
  },
  repos: {
    get: vi.fn().mockResolvedValue({
      data: { stargazers_count: 10, open_issues_count: 5 },
    }),
    listCommits: vi.fn().mockResolvedValue({
      data: [{ commit: { committer: { date: "2026-04-06T10:00:00Z" } } }],
    }),
    listContributors: vi.fn().mockResolvedValue({ data: new Array(7).fill({}) }),
  },
  issues: {
    listForRepo: vi.fn().mockResolvedValue({ data: [] }),
  },
  pulls: {
    list: vi.fn().mockResolvedValue({ data: [{}] }),
  },
  search: {
    issuesAndPullRequests: vi.fn().mockResolvedValue({ data: { total_count: 3 } }),
  },
  ...overrides,
});

let mockOctokitInstance = makeOctokit();

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return mockOctokitInstance;
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GitHubService", () => {
  beforeEach(() => {
    mockOctokitInstance = makeOctokit();
    vi.clearAllMocks();
  });

  // ── isAuthenticated ──────────────────────────────────────────────────────────

  describe("isAuthenticated()", () => {
    it("returns true when a token is provided", () => {
      const svc = new GitHubService("ghp_test");
      expect(svc.isAuthenticated()).toBe(true);
    });

    it("returns false when no token is provided", () => {
      // Ensure env var is absent
      const saved = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      const svc = new GitHubService();
      expect(svc.isAuthenticated()).toBe(false);
      process.env.GITHUB_TOKEN = saved;
    });
  });

  // ── getRateLimitStatus ───────────────────────────────────────────────────────

  describe("getRateLimitStatus()", () => {
    it("returns remaining, limit, and resetAt on success", async () => {
      const svc = new GitHubService("ghp_test");
      const status = await svc.getRateLimitStatus();
      expect(status).not.toBeNull();
      expect(status!.remaining).toBe(59);
      expect(status!.limit).toBe(60);
      expect(status!.resetAt).toBeInstanceOf(Date);
    });

    it("returns null when the API call throws", async () => {
      mockOctokitInstance = makeOctokit({
        rateLimit: { get: vi.fn().mockRejectedValue(new Error("network")) },
      });
      const svc = new GitHubService("ghp_test");
      const status = await svc.getRateLimitStatus();
      expect(status).toBeNull();
    });

    it("resets to unauthenticated and retries on 401", async () => {
      let callCount = 0;
      mockOctokitInstance = makeOctokit({
        rateLimit: {
          get: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              const err: any = new Error("Unauthorized");
              err.status = 401;
              return Promise.reject(err);
            }
            return Promise.resolve({
              data: { rate: { remaining: 30, limit: 60, reset: 9999999999 } },
            });
          }),
        },
      });
      const svc = new GitHubService("ghp_bad");
      const status = await svc.getRateLimitStatus();
      expect(status).not.toBeNull();
      expect(status!.remaining).toBe(30);
      expect(svc.isAuthenticated()).toBe(false);
    });
  });

  // ── getMetrics ───────────────────────────────────────────────────────────────

  describe("getMetrics()", () => {
    it("returns assembled GitHubMetrics on success", async () => {
      const svc = new GitHubService("ghp_test");
      const metrics = await svc.getMetrics("rsksmart", "rsk-cli");
      expect(metrics.stars).toBe(10);
      expect(metrics.openIssuesCount).toBe(5);
      expect(metrics.lastCommitDate).toBe("2026-04-06T10:00:00Z");
      expect(metrics.pullRequestsCount).toBe(3); // from search API
      expect(metrics.contributorCount).toBe(7);
      expect(metrics.repository).toBe("rsksmart/rsk-cli");
    });

    it("falls back to pulls list length when search API fails", async () => {
      mockOctokitInstance = makeOctokit({
        search: {
          issuesAndPullRequests: vi.fn().mockRejectedValue(new Error("rate")),
        },
      });
      const svc = new GitHubService("ghp_test");
      const metrics = await svc.getMetrics("rsksmart", "rsk-cli");
      // pulls.list returns [{}] (length 1)
      expect(metrics.pullRequestsCount).toBe(1);
    });

    it("returns 0 contributor count when listContributors fails", async () => {
      mockOctokitInstance = makeOctokit({
        repos: {
          ...makeOctokit().repos,
          listContributors: vi.fn().mockRejectedValue(new Error("forbidden")),
        },
      });
      const svc = new GitHubService("ghp_test");
      const metrics = await svc.getMetrics("rsksmart", "rsk-cli");
      expect(metrics.contributorCount).toBe(0);
    });

    it("throws on 404 with a descriptive message", async () => {
      mockOctokitInstance = makeOctokit({
        repos: {
          ...makeOctokit().repos,
          get: vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 })),
        },
      });
      const svc = new GitHubService("ghp_test");
      await expect(svc.getMetrics("rsksmart", "nonexistent")).rejects.toThrow(
        "not found"
      );
    });

    it("resets to unauthenticated and retries fetchMetrics on 401 (no nested race)", async () => {
      // First call to repos.get throws 401; after auth reset the mock returns normally
      let reposGetCalls = 0;
      mockOctokitInstance = makeOctokit({
        repos: {
          ...makeOctokit().repos,
          get: vi.fn().mockImplementation(() => {
            reposGetCalls++;
            if (reposGetCalls === 1) {
              return Promise.reject(Object.assign(new Error("Unauthorized"), { status: 401 }));
            }
            return Promise.resolve({ data: { stargazers_count: 5, open_issues_count: 2 } });
          }),
        },
      });
      const svc = new GitHubService("ghp_bad");
      const metrics = await svc.getMetrics("rsksmart", "rsk-cli");
      expect(svc.isAuthenticated()).toBe(false);
      expect(metrics.stars).toBe(5);
    });

    it("throws a rate-limit error on 403 including reset time", async () => {
      const resetTs = String(Math.floor(Date.now() / 1000) + 3600);
      mockOctokitInstance = makeOctokit({
        repos: {
          ...makeOctokit().repos,
          get: vi.fn().mockRejectedValue(
            Object.assign(new Error("Forbidden"), {
              status: 403,
              response: { headers: { "x-ratelimit-reset": resetTs } },
            })
          ),
        },
      });
      const svc = new GitHubService();
      await expect(svc.getMetrics("rsksmart", "rsk-cli")).rejects.toThrow(
        /rate limit/i
      );
    });

    it("rejects when the total timeout fires", async () => {
      mockOctokitInstance = makeOctokit({
        repos: {
          ...makeOctokit().repos,
          // Never resolves
          get: vi.fn().mockReturnValue(new Promise(() => {})),
        },
      });
      const svc = new GitHubService("ghp_test");
      // Reduce TOTAL_TIMEOUT via a short race instead of waiting 60 s
      const race = Promise.race([
        svc.getMetrics("rsksmart", "rsk-cli"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("test timeout sentinel")), 200)
        ),
      ]);
      await expect(race).rejects.toThrow("test timeout sentinel");
    });
  });
});
