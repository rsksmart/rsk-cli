import { Octokit } from "@octokit/rest";
import type { GitHubMetrics } from "../types.js";

export class GitHubService {
  private octokit: Octokit;
  private hasToken: boolean;
  private tokenInvalid = false;
  private readonly API_TIMEOUT = 15_000;
  private readonly TOTAL_TIMEOUT = 60_000;

  constructor(token?: string) {
    const authToken = token ?? process.env.GITHUB_TOKEN;
    this.hasToken = !!authToken;
    this.octokit = new Octokit({ auth: authToken });
  }

  /** Race a promise against a deadline. */
  private withTimeout<T>(promise: Promise<T>, ms = this.API_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`GitHub API call timed out after ${ms}ms`)),
          ms
        )
      ),
    ]);
  }

  /** Fall back to unauthenticated mode after a 401 response. */
  private resetToUnauthenticated(): void {
    if (this.tokenInvalid) return;
    this.tokenInvalid = true;
    this.hasToken = false;
    this.octokit = new Octokit();
  }

  isAuthenticated(): boolean {
    return this.hasToken && !this.tokenInvalid;
  }

  async getRateLimitStatus(): Promise<{
    remaining: number;
    limit: number;
    resetAt: Date;
  } | null> {
    try {
      const { data } = await this.withTimeout(
        this.octokit.rateLimit.get(),
        5_000
      );
      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        resetAt: new Date(data.rate.reset * 1000),
      };
    } catch (err: any) {
      if (err.status === 401 && this.hasToken && !this.tokenInvalid) {
        this.resetToUnauthenticated();
        try {
          const { data } = await this.withTimeout(
            this.octokit.rateLimit.get(),
            5_000
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

  async getMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    return Promise.race([
      this.fetchMetrics(owner, repo),
      new Promise<GitHubMetrics>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `GitHub metrics timed out after ${this.TOTAL_TIMEOUT}ms`
              )
            ),
          this.TOTAL_TIMEOUT
        )
      ),
    ]);
  }

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

      const { data: pullRequests } = await this.withTimeout(
        this.octokit.pulls.list({ owner, repo, state: "open", per_page: 1 })
      );

      let prsCount = 0;
      if (this.hasToken) {
        try {
          const { data: prSearch } = await this.withTimeout(
            this.octokit.search.issuesAndPullRequests({
              q: `repo:${owner}/${repo} type:pr state:open`,
              per_page: 1,
            })
          );
          prsCount = prSearch.total_count;
        } catch {
          prsCount = pullRequests.length;
        }
      } else {
        prsCount = pullRequests.length;
      }

      let contributorsCount = 0;
      try {
        const { data: contributors } = await this.withTimeout(
          this.octokit.repos.listContributors({
            owner,
            repo,
            per_page: this.hasToken ? 100 : 30,
          })
        );
        contributorsCount = contributors.length;
      } catch {
        contributorsCount = 0;
      }

      return {
        stars: repoData.stargazers_count ?? 0,
        lastCommitDate: commits[0]?.commit.committer?.date ?? null,
        openIssuesCount: repoData.open_issues_count ?? 0,
        pullRequestsCount: prsCount,
        contributorCount: contributorsCount,
        repository: `${owner}/${repo}`,
      };
    } catch (err: any) {
      if (err.status === 401) {
        if (this.hasToken && !this.tokenInvalid) {
          this.resetToUnauthenticated();
          return this.getMetrics(owner, repo);
        }
        throw new Error(`GitHub authentication failed: ${err.message}`);
      }
      if (err.status === 404) {
        throw new Error(
          `Repository "${owner}/${repo}" not found — ensure it is public and the format is owner/repo.`
        );
      }
      if (err.status === 403) {
        const resetHeader = err.response?.headers?.["x-ratelimit-reset"];
        let msg = "GitHub API rate limit exceeded.";
        if (!this.hasToken) {
          msg +=
            " Pass --github-token or set GITHUB_TOKEN for 5,000 requests/hour.";
        }
        if (resetHeader) {
          msg += ` Resets at: ${new Date(
            parseInt(resetHeader) * 1000
          ).toLocaleString()}`;
        }
        throw new Error(msg);
      }
      throw new Error(`Failed to fetch GitHub metrics: ${err.message}`);
    }
  }
}
