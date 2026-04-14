import { describe, it, expect } from "vitest";
import { formatAsTable } from "../../formatters/devmetrics/table.formatter.js";
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
    deploymentBlock: 5000000,
    totalTransactionCount: 42,
    lastTransactionTimestamp: "2026-04-10T08:00:00.000Z",
    gasUsagePatterns: { average: 21000, min: 21000, max: 50000 },
  },
  timestamp: "2026-04-14T00:00:00.000Z",
};

describe("formatAsTable", () => {
  it("returns a non-empty string", () => {
    const output = formatAsTable([REPORT]);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  it("contains the repository name", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("rsksmart/rsk-cli");
  });

  it("contains the contract address", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d");
  });

  it("contains GitHub Metrics column header", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("GitHub Metrics");
  });

  it("contains Rootstock Metrics column header", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("Rootstock Metrics");
  });

  it("renders star count", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("6");
  });

  it("renders contributor count", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("17");
  });

  it("renders deployment block number", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("5000000");
  });

  it("renders total transaction count", () => {
    const output = formatAsTable([REPORT]);
    expect(output).toContain("42");
  });

  it("renders N/A for null deployment block", () => {
    const withNull: DevMetricsReport = {
      ...REPORT,
      rootstock: { ...REPORT.rootstock, deploymentBlock: null },
    };
    const output = formatAsTable([withNull]);
    expect(output).toContain("N/A");
  });

  it("renders N/A for null last transaction timestamp", () => {
    const withNull: DevMetricsReport = {
      ...REPORT,
      rootstock: { ...REPORT.rootstock, lastTransactionTimestamp: null },
    };
    const output = formatAsTable([withNull]);
    expect(output).toContain("N/A");
  });

  it("renders N/A for null last commit date", () => {
    const withNull: DevMetricsReport = {
      ...REPORT,
      github: { ...REPORT.github, lastCommitDate: null },
    };
    const output = formatAsTable([withNull]);
    expect(output).toContain("N/A");
  });

  it("handles multiple reports without throwing", () => {
    const second: DevMetricsReport = { ...REPORT, repository: "rsksmart/rif-wallet" };
    expect(() => formatAsTable([REPORT, second])).not.toThrow();
    expect(formatAsTable([REPORT, second])).toContain("rif-wallet");
  });

  it("handles an empty array without throwing", () => {
    expect(() => formatAsTable([])).not.toThrow();
  });
});
