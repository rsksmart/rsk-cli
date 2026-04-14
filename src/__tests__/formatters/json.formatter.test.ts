import { describe, it, expect } from "vitest";
import { formatAsJSON } from "../../formatters/devmetrics/json.formatter.js";
import { DevMetricsReport } from "../../utils/types.js";

const REPORT: DevMetricsReport = {
  repository: "rsksmart/rsk-cli",
  contractAddress: "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d",
  github: {
    stars: 42,
    lastCommitDate: "2026-04-06T10:00:00Z",
    openIssuesCount: 5,
    pullRequestsCount: 2,
    contributorCount: 10,
    repository: "rsksmart/rsk-cli",
  },
  rootstock: {
    contractAddress: "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d",
    deploymentBlock: 5000000,
    totalTransactionCount: 123,
    lastTransactionTimestamp: "2026-04-10T08:00:00.000Z",
    gasUsagePatterns: { average: 21000, min: 21000, max: 50000 },
  },
  timestamp: "2026-04-14T00:00:00.000Z",
};

describe("formatAsJSON", () => {
  it("returns valid JSON", () => {
    const output = formatAsJSON([REPORT]);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("contains all top-level fields of the report", () => {
    const parsed = JSON.parse(formatAsJSON([REPORT]));
    expect(parsed).toHaveLength(1);
    const r = parsed[0];
    expect(r.repository).toBe(REPORT.repository);
    expect(r.contractAddress).toBe(REPORT.contractAddress);
    expect(r.timestamp).toBe(REPORT.timestamp);
  });

  it("serialises GitHub metrics correctly", () => {
    const parsed = JSON.parse(formatAsJSON([REPORT]));
    expect(parsed[0].github.stars).toBe(42);
    expect(parsed[0].github.contributorCount).toBe(10);
    expect(parsed[0].github.lastCommitDate).toBe("2026-04-06T10:00:00Z");
  });

  it("serialises Rootstock metrics correctly", () => {
    const parsed = JSON.parse(formatAsJSON([REPORT]));
    expect(parsed[0].rootstock.deploymentBlock).toBe(5000000);
    expect(parsed[0].rootstock.totalTransactionCount).toBe(123);
    expect(parsed[0].rootstock.gasUsagePatterns.average).toBe(21000);
  });

  it("outputs multiple reports as an array", () => {
    const second: DevMetricsReport = { ...REPORT, repository: "rsksmart/rif-wallet" };
    const parsed = JSON.parse(formatAsJSON([REPORT, second]));
    expect(parsed).toHaveLength(2);
    expect(parsed[1].repository).toBe("rsksmart/rif-wallet");
  });

  it("handles an empty reports array", () => {
    const parsed = JSON.parse(formatAsJSON([]));
    expect(parsed).toEqual([]);
  });

  it("handles a null deploymentBlock correctly", () => {
    const withNull: DevMetricsReport = {
      ...REPORT,
      rootstock: { ...REPORT.rootstock, deploymentBlock: null },
    };
    const parsed = JSON.parse(formatAsJSON([withNull]));
    expect(parsed[0].rootstock.deploymentBlock).toBeNull();
  });
});
