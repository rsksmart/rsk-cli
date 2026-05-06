import { describe, expect, it } from "vitest";
import { formatAsJSON } from "../src/formatters/devmetrics/json.js";
import { formatAsMarkdown } from "../src/formatters/devmetrics/markdown.js";
import { formatAsTable } from "../src/formatters/devmetrics/table.js";
import { DevMetricsReport } from "../src/types/devmetrics.js";

const sample: DevMetricsReport[] = [
  {
    repository: "acme/repo",
    contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    timestamp: new Date().toISOString(),
    github: {
      stars: 1,
      lastCommitDate: new Date().toISOString(),
      openIssuesCount: 2,
      pullRequestsCount: 3,
      contributorCount: 4,
      repository: "acme/repo",
    },
    rootstock: {
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      deploymentBlock: 123,
      totalTransactionCount: 9,
      lastTransactionTimestamp: new Date().toISOString(),
      gasUsagePatterns: { average: 1000, min: 900, max: 1200 },
    },
  },
];

describe("devmetrics formatters", () => {
  it("formats JSON output", () => {
    const output = formatAsJSON(sample);
    expect(JSON.parse(output)[0].repository).toBe("acme/repo");
  });

  it("formats markdown output", () => {
    const output = formatAsMarkdown(sample);
    expect(output).toContain("# Developer Health Report: acme/repo");
    expect(output).toContain("## GitHub Metrics");
  });

  it("formats table output", () => {
    const output = formatAsTable(sample);
    expect(output).toContain("Report for acme/repo");
    expect(output).toContain("GitHub Metrics");
    expect(output).toContain("Rootstock Metrics");
  });
});
