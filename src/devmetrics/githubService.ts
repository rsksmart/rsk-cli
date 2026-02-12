import { Octokit } from "@octokit/rest";
import { GitHubMetrics } from "./types.js";

/**
 * Lightweight GitHub service used by the dev-metrics command.
 * Mirrors the behavior of the standalone devmetrics project but is self-contained
 * and does not perform any logging or spinner management (that is done in commands).
 */
export class GitHubDevMetricsService {
  private octokit: Octokit;
  private hasToken: boolean;
  private tokenInvalid = false;
  private readonly API_TIMEOUT = 15_000; // 15 seconds per API call
  private readonly TOTAL_TIMEOUT = 60_000; // 60 seconds total for all GitHub calls

  constructor(token?: string) {
    const authToken = token || process.env.GITHUB_TOKEN;
    this.hasToken = !!authToken;
    this.octokit = new Octokit({
      auth: authToken,
      request: {
        timeout: this.API_TIMEOUT,
      },
    });
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.API_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`GitHub API call timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  private resetToUnauthenticated() {
    if (this.tokenInvalid) return;
    this.tokenInvalid = true;
    this.hasToken = false;
    this.octokit = new Octokit();
  }

  isAuthenticated(): boolean {
    return this.hasToken;
  }

  async getRateLimitStatus(): Promise<{ remaining: number; limit: number; resetAt: Date } | null> {
    try {
      const { data } = await this.withTimeout(this.octokit.rateLimit.get(), 5_000);
      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        resetAt: new Date(data.rate.reset * 1000),
      };
    } catch (error: any) {
      if (error?.status === 401 && this.hasToken && !this.tokenInvalid) {
        this.resetToUnauthenticated();
        try {
          const { data } = await this.withTimeout(this.octokit.rateLimit.get(), 5_000);
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

  async getMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    return Promise.race([
      this.fetchMetrics(owner, repo),
      new Promise<GitHubMetrics>((_, reject) =>
        setTimeout(
          () => reject(new Error(`GitHub metrics fetch timed out after ${this.TOTAL_TIMEOUT}ms`)),
          this.TOTAL_TIMEOUT,
        ),
      ),
    ]);
  }

  private async fetchMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    try {
      const { data: repoData } = await this.withTimeout(
        this.octokit.repos.get({
          owner,
          repo,
        }),
      );

      const { data: commits } = await this.withTimeout(
        this.octokit.repos.listCommits({
          owner,
          repo,
          per_page: 1,
        }),
      );

      const { data: issues } = await this.withTimeout(
        this.octokit.issues.listForRepo({
          owner,
          repo,
          state: "open",
          per_page: 1,
        }),
      );

      const { data: pullRequests } = await this.withTimeout(
        this.octokit.pulls.list({
          owner,
          repo,
          state: "open",
          per_page: 1,
        }),
      );

      const issuesCount = repoData.open_issues_count || 0;

      let prsCount = 0;
      if (this.hasToken) {
        try {
          const { data: prSearch } = await this.withTimeout(
            this.octokit.search.issuesAndPullRequests({
              q: `repo:${owner}/${repo} type:pr state:open`,
              per_page: 1,
            }),
          );
          prsCount = prSearch.total_count || 0;
        } catch {
          prsCount = pullRequests.length > 0 ? pullRequests.length : 0;
        }
      } else {
        prsCount = pullRequests.length > 0 ? pullRequests.length : 0;
      }

      let contributorsCount = 0;
      try {
        if (this.hasToken) {
          const { data: allContributors } = await this.withTimeout(
            this.octokit.repos.listContributors({
              owner,
              repo,
              per_page: 100,
            }),
          );
          contributorsCount = allContributors.length;
        } else {
          const { data: contributors } = await this.withTimeout(
            this.octokit.repos.listContributors({
              owner,
              repo,
              per_page: 30,
            }),
          );
          contributorsCount = contributors.length;
        }
      } catch {
        contributorsCount = 0;
      }

      return {
        stars: repoData.stargazers_count || 0,
        lastCommitDate: commits[0]?.commit.committer?.date || null,
        openIssuesCount: issuesCount,
        pullRequestsCount: prsCount,
        contributorCount: contributorsCount,
        repository: `${owner}/${repo}`,
      };
    } catch (error: any) {
      if (error?.status === 401) {
        if (this.hasToken && !this.tokenInvalid) {
          this.resetToUnauthenticated();
          try {
            return await this.getMetrics(owner, repo);
          } catch (retryError: any) {
            throw new Error(
              `GitHub token is invalid or expired. Falling back to unauthenticated mode (60 requests/hour limit). Original error: ${retryError?.message || error.message}`,
            );
          }
        }
        throw new Error(`GitHub API authentication failed: ${error.message}`);
      }

      if (error?.status === 404) {
        throw new Error(`Repository ${owner}/${repo} not found`);
      }

      if (error?.status === 403) {
        const resetTime = error.response?.headers?.["x-ratelimit-reset"];
        let message = "GitHub API rate limit exceeded.";

        if (this.hasToken && !this.tokenInvalid) {
          message += " You have a token configured but still hit the limit (5,000/hour).";
        } else {
          message += " Without a token, you are limited to 60 requests/hour.";
          message += " Add a valid GITHUB_TOKEN environment variable for 5,000 requests/hour.";
        }

        if (resetTime) {
          const resetDate = new Date(parseInt(resetTime, 10) * 1000);
          message += ` Rate limit resets at: ${resetDate.toLocaleString()}`;
        }

        throw new Error(message);
      }

      throw new Error(`Failed to fetch GitHub metrics: ${error?.message || String(error)}`);
    }
  }
}

