import { describe, it, expect } from "vitest";
import { formatAsMarkdown } from "../../formatters/devmetrics/markdown.formatter.js";
import { DevMetricsReport } from "../../utils/types.js";

const REPORT: DevMetricsReport = {
  repository: "rsksmart/rsk-cli",
  contractAddress: "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d",
  github: {
    stars: 6,
    lastCommitDate: "2026-04-06T10:00:00Z",
    openIssuesCount: 26,
    pullRequestsCount: 1,
    contributorCount: 17,
    repository: "rsksmart/rsk-cli",
  },
  rootstock: {
    contractAddress: "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d",
    deploymentBlock: null,
    totalTransactionCount: 0,
    lastTransactionTimestamp: null,
    gasUsagePatterns: { average: 0, min: 0, max: 0 },
  },
  timestamp: "2026-04-14T00:00:00.000Z",
};

describe("formatAsMarkdown", () => {
  it("starts with an H1 containing the repository name", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toMatch(/^# Developer Health Report: rsksmart\/rsk-cli/m);
  });

  it("includes the contract address", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d");
  });

  it("contains GitHub Metrics section heading", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("## 📊 GitHub Metrics");
  });

  it("contains Rootstock Metrics section heading", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("## ⛓️ Rootstock Metrics");
  });

  it("renders star count", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("| ⭐ Stars | 6 |");
  });

  it("renders open issues count", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("| 🐛 Open Issues | 26 |");
  });

  it("renders N/A for null deployment block", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("| 📦 Deployment Block | N/A |");
  });

  it("renders N/A for null last transaction", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("| ⏰ Last Transaction | N/A |");
  });

  it("renders a formatted last commit date when present", () => {
    const output = formatAsMarkdown([REPORT]);
    // The date cell should not be 'N/A'
    const lastCommitRow = output
      .split("\n")
      .find((l) => l.startsWith("| 📝 Last Commit"));
    expect(lastCommitRow).toBeDefined();
    expect(lastCommitRow).not.toContain("N/A");
  });

  it("adds a separator between multiple reports", () => {
    const second: DevMetricsReport = { ...REPORT, repository: "rsksmart/rif-wallet" };
    const output = formatAsMarkdown([REPORT, second]);
    expect(output).toContain("---");
    expect(output).toContain("rsksmart/rif-wallet");
  });

  it("does NOT add a separator for a single report", () => {
    const output = formatAsMarkdown([REPORT]);
    // '---' should not appear as a thematic break (only in HR positions)
    const hrLines = output.split("\n").filter((l) => l.trim() === "---");
    expect(hrLines).toHaveLength(0);
  });

  it("contains a pipe-table header row", () => {
    const output = formatAsMarkdown([REPORT]);
    expect(output).toContain("| Metric | Value |");
    expect(output).toContain("|--------|-------|");
  });
});
