import { Octokit } from "@octokit/rest";
import { GitHubMetrics } from "../utils/types.js";

export class GitHubService {
  private octokit: Octokit;
  private hasToken: boolean;
  private tokenInvalid: boolean = false;
  private readonly API_TIMEOUT = 15000;
  private readonly TOTAL_TIMEOUT = 60000;

  constructor(token?: string) {
    const authToken = token || process.env.GITHUB_TOKEN;
    this.hasToken = !!authToken;
    this.octokit = new Octokit({
      auth: authToken,
      request: { timeout: this.API_TIMEOUT },
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Wraps a promise in a hard timeout so individual API calls never stall
   * indefinitely. The outer TOTAL_TIMEOUT in getMetrics() acts as the
   * per-request-set budget; this per-call guard prevents any single RPC from
   * consuming that entire budget.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = this.API_TIMEOUT
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`GitHub API call timed out after ${timeoutMs}ms`)
            ),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * One-way downgrade: marks the token as invalid and re-initialises the
   * Octokit instance without auth. Guards against repeated resets.
   */
  private resetToUnauthenticated(): void {
    if (this.tokenInvalid) return;
    this.tokenInvalid = true;
    this.hasToken = false;
    this.octokit = new Octokit();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return this.hasToken;
  }

  async getRateLimitStatus(): Promise<{
    remaining: number;
    limit: number;
    resetAt: Date;
  } | null> {
    try {
      const { data } = await this.withTimeout(
        this.octokit.rateLimit.get(),
        5000
      );
      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        resetAt: new Date(data.rate.reset * 1000),
      };
    } catch (error: any) {
      // Token is invalid — reset once and retry without auth
      if (error.status === 401 && this.hasToken && !this.tokenInvalid) {
        this.resetToUnauthenticated();
        try {
          const { data } = await this.withTimeout(
            this.octokit.rateLimit.get(),
            5000
          );
          return {
            remaining: data.rate.remaining,
            limit: data.rate.limit,
            resetAt: new Date(data.rate.reset * 1000),
          };
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Public entry point. Enforces a single hard TOTAL_TIMEOUT budget over the
   * entire fetch sequence. fetchMetrics() is called directly here — never
   * recursively — so only one Promise.race timer is ever active per invocation.
   */
  async getMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    return Promise.race([
      this.fetchMetrics(owner, repo),
      new Promise<GitHubMetrics>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `GitHub metrics fetch timed out after ${this.TOTAL_TIMEOUT}ms`
              )
            ),
          this.TOTAL_TIMEOUT
        )
      ),
    ]);
  }

  /**
   * Performs all GitHub API calls and returns the assembled GitHubMetrics.
   *
   * On a 401 the instance resets to unauthenticated and retries fetchMetrics()
   * directly rather than going back through getMetrics(). This keeps the
   * single outer Promise.race timeout intact and prevents nested race timers.
   */
  private async fetchMetrics(
    owner: string,
    repo: string
  ): Promise<GitHubMetrics> {
    try {
      const { data: repoData } = await this.withTimeout(
        this.octokit.repos.get({ owner, repo })
      );

      const { data: commits } = await this.withTimeout(
        this.octokit.repos.listCommits({ owner, repo, per_page: 1 })
      );

      // Fetched to keep the API surface consistent; actual count comes from
      // repoData.open_issues_count which GitHub always includes.
      await this.withTimeout(
        this.octokit.issues.listForRepo({
          owner,
          repo,
          state: "open",
          per_page: 1,
        })
      );

      const { data: pullRequests } = await this.withTimeout(
        this.octokit.pulls.list({ owner, repo, state: "open", per_page: 1 })
      );

      const issuesCount = repoData.open_issues_count ?? 0;

      // With a token: use the search API for an accurate open-PR count.
      // Without: the per_page:1 list is a sample only (saves rate-limit budget).
      let prsCount = 0;
      if (this.hasToken) {
        try {
          const { data: prSearch } = await this.withTimeout(
            this.octokit.search.issuesAndPullRequests({
              q: `repo:${owner}/${repo} type:pr state:open`,
              per_page: 1,
            })
          );
          prsCount = prSearch.total_count ?? 0;
        } catch {
          prsCount = pullRequests.length;
        }
      } else {
        prsCount = pullRequests.length;
      }

      // First-page contributor count (estimate). With a token we request up to
      // 100; without, we stay within the unauthenticated rate budget (30).
      let contributorsCount = 0;
      try {
        const perPage = this.hasToken ? 100 : 30;
        const { data: contributors } = await this.withTimeout(
          this.octokit.repos.listContributors({
            owner,
            repo,
            per_page: perPage,
          })
        );
        contributorsCount = contributors.length;
      } catch {
        contributorsCount = 0;
      }

      return {
        stars: repoData.stargazers_count ?? 0,
        lastCommitDate: commits[0]?.commit.committer?.date ?? null,
        openIssuesCount: issuesCount,
        pullRequestsCount: prsCount,
        contributorCount: contributorsCount,
        repository: `${owner}/${repo}`,
      };
    } catch (error: any) {
      if (error.status === 401) {
        if (this.hasToken && !this.tokenInvalid) {
          // Reset auth state and retry fetchMetrics() directly — NOT getMetrics()
          // — so we remain within the single Promise.race timeout that the caller
          // already set up. tokenInvalid guards against a second 401 retry loop.
          this.resetToUnauthenticated();
          return this.fetchMetrics(owner, repo);
        }
        throw new Error(`GitHub API authentication failed: ${error.message}`);
      }

      if (error.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found`);
      }

      if (error.status === 403) {
        const resetTime = error.response?.headers?.["x-ratelimit-reset"];
        const base =
          this.hasToken && !this.tokenInvalid
            ? "GitHub API rate limit exceeded. You have a token configured but still hit the limit (5,000/hour)."
            : "GitHub API rate limit exceeded. Without a token you are limited to 60 requests/hour. Set GITHUB_TOKEN for 5,000/hour.";
        const resetSuffix = resetTime
          ? ` Rate limit resets at: ${new Date(parseInt(resetTime) * 1000).toLocaleString()}`
          : "";
        throw new Error(`${base}${resetSuffix}`);
      }

      throw new Error(`Failed to fetch GitHub metrics: ${error.message}`);
    }
  }
}
