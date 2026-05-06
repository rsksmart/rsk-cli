import { Octokit } from "@octokit/rest";
import { GitHubMetrics } from "../../types/devmetrics.js";

type OctokitLike = Octokit;

export class GitHubService {
  private octokit: OctokitLike;
  private hasToken: boolean;
  private readonly apiTimeoutMs = 15000;
  private readonly totalTimeoutMs = 60000;

  constructor(token?: string) {
    const authToken = token || process.env.GITHUB_TOKEN;
    this.hasToken = !!authToken;
    this.octokit = this.createOctokit(authToken);
  }

  private createOctokit(authToken?: string): OctokitLike {
    const noopLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    return new Octokit({
      auth: authToken,
      log: noopLogger,
      request: {
        timeout: this.apiTimeoutMs,
      },
    });
  }

  isAuthenticated(): boolean {
    return this.hasToken;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.apiTimeoutMs): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`GitHub API call timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  }

  async getMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    return this.withTimeout(this.getMetricsWithFallback(owner, repo), this.totalTimeoutMs);
  }

  private async getMetricsWithFallback(owner: string, repo: string): Promise<GitHubMetrics> {
    try {
      return await this.fetchMetrics(owner, repo);
    } catch (error: any) {
      if (error?.status === 401 && this.hasToken) {
        this.hasToken = false;
        this.octokit = this.createOctokit(undefined);
        return this.fetchMetrics(owner, repo);
      }
      throw this.normalizeError(error, owner, repo);
    }
  }

  private async fetchMetrics(owner: string, repo: string): Promise<GitHubMetrics> {
    const { data: repoData } = await this.withTimeout(this.octokit.repos.get({ owner, repo }));

    const { data: commits } = await this.withTimeout(
      this.octokit.repos.listCommits({
        owner,
        repo,
        per_page: 1,
      })
    );

    const { data: pullRequests } = await this.withTimeout(
      this.octokit.pulls.list({
        owner,
        repo,
        state: "open",
        per_page: 1,
      })
    );

    let prsCount = 0;
    try {
      const { data: prSearch } = await this.withTimeout(
        this.octokit.search.issuesAndPullRequests({
          q: `repo:${owner}/${repo} type:pr state:open`,
          per_page: 1,
        })
      );
      prsCount = prSearch.total_count || 0;
    } catch {
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
      stars: repoData.stargazers_count || 0,
      lastCommitDate: commits[0]?.commit.committer?.date || null,
      openIssuesCount: repoData.open_issues_count || 0,
      pullRequestsCount: prsCount,
      contributorCount: contributorsCount,
      repository: `${owner}/${repo}`,
    };
  }

  private normalizeError(error: any, owner: string, repo: string): Error {
    if (error?.status === 404) {
      return new Error(`Repository ${owner}/${repo} not found`);
    }

    if (error?.status === 403) {
      const resetTime = error?.response?.headers?.["x-ratelimit-reset"];
      let message = "GitHub API rate limit exceeded.";
      if (this.hasToken) {
        message += " Token-authenticated limit was reached.";
      } else {
        message += " Add GITHUB_TOKEN for higher rate limits.";
      }
      if (resetTime) {
        const resetDate = new Date(Number.parseInt(resetTime, 10) * 1000);
        message += ` Rate limit resets at: ${resetDate.toLocaleString()}`;
      }
      return new Error(message);
    }

    return new Error(`Failed to fetch GitHub metrics: ${error?.message || "Unknown error"}`);
  }
}
