import type { DevMetricsReport } from "../types.js";

export function formatAsMarkdown(reports: DevMetricsReport[]): string {
  const lines: string[] = [];

  for (const report of reports) {
    lines.push(`# Developer Health Report: ${report.repository}`);
    lines.push("");
    lines.push(`**Contract Address:** \`${report.contractAddress}\``);
    lines.push(
      `**Generated:** ${new Date(report.timestamp).toLocaleString()}`
    );
    lines.push("");

    lines.push("## 📊 GitHub Metrics");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| ⭐ Stars | ${report.github.stars} |`);
    lines.push(
      `| 📝 Last Commit | ${
        report.github.lastCommitDate
          ? new Date(report.github.lastCommitDate).toLocaleDateString()
          : "N/A"
      } |`
    );
    lines.push(`| 🐛 Open Issues | ${report.github.openIssuesCount} |`);
    lines.push(`| 🔀 Open PRs | ${report.github.pullRequestsCount} |`);
    lines.push(`| 👥 Contributors | ${report.github.contributorCount} |`);
    lines.push("");

    lines.push("## ⛓️ Rootstock Metrics");
    lines.push("");
    if (report.rootstock.note) {
      lines.push(`> ⚠️ ${report.rootstock.note}`);
      lines.push("");
    }
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(
      `| 📦 Deployment Block | ${
        report.rootstock.deploymentBlock ?? "N/A"
      } |`
    );
    lines.push(
      `| 📊 Total Txs (est.) | ${report.rootstock.totalTransactionCount} |`
    );
    lines.push(
      `| ⏰ Last Transaction | ${
        report.rootstock.lastTransactionTimestamp
          ? new Date(
              report.rootstock.lastTransactionTimestamp
            ).toLocaleDateString()
          : "N/A"
      } |`
    );
    lines.push(
      `| ⛽ Avg Gas Used | ${report.rootstock.gasUsagePatterns.average.toLocaleString()} |`
    );
    lines.push(
      `| ⛽ Min Gas Used | ${report.rootstock.gasUsagePatterns.min.toLocaleString()} |`
    );
    lines.push(
      `| ⛽ Max Gas Used | ${report.rootstock.gasUsagePatterns.max.toLocaleString()} |`
    );
    lines.push("");

    if (reports.length > 1) {
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}
