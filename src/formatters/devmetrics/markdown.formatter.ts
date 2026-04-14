import { DevMetricsReport } from "../../utils/types.js";

export function formatAsMarkdown(reports: DevMetricsReport[]): string {
  const output: string[] = [];

  for (const report of reports) {
    output.push(`# Developer Health Report: ${report.repository}`);
    output.push("");
    output.push(`**Contract Address:** \`${report.contractAddress}\``);
    output.push(
      `**Generated:** ${new Date(report.timestamp).toLocaleString()}`
    );
    output.push("");

    output.push("## 📊 GitHub Metrics");
    output.push("");
    output.push("| Metric | Value |");
    output.push("|--------|-------|");
    output.push(`| ⭐ Stars | ${report.github.stars} |`);
    output.push(
      `| 📝 Last Commit | ${
        report.github.lastCommitDate
          ? new Date(report.github.lastCommitDate).toLocaleDateString()
          : "N/A"
      } |`
    );
    output.push(`| 🐛 Open Issues | ${report.github.openIssuesCount} |`);
    output.push(`| 🔀 Open PRs | ${report.github.pullRequestsCount} |`);
    output.push(`| 👥 Contributors | ${report.github.contributorCount} |`);
    output.push("");

    output.push("## ⛓️ Rootstock Metrics");
    output.push("");
    output.push("| Metric | Value |");
    output.push("|--------|-------|");
    output.push(
      `| 📦 Deployment Block | ${report.rootstock.deploymentBlock ?? "N/A"} |`
    );
    output.push(
      `| 📊 Total Transactions | ${report.rootstock.totalTransactionCount} |`
    );
    output.push(
      `| ⏰ Last Transaction | ${
        report.rootstock.lastTransactionTimestamp
          ? new Date(
              report.rootstock.lastTransactionTimestamp
            ).toLocaleDateString()
          : "N/A"
      } |`
    );
    output.push(
      `| ⛽ Average Gas Usage | ${report.rootstock.gasUsagePatterns.average.toLocaleString()} |`
    );
    output.push(
      `| ⛽ Min Gas Usage | ${report.rootstock.gasUsagePatterns.min.toLocaleString()} |`
    );
    output.push(
      `| ⛽ Max Gas Usage | ${report.rootstock.gasUsagePatterns.max.toLocaleString()} |`
    );
    output.push("");

    if (reports.length > 1) {
      output.push("---");
      output.push("");
    }
  }

  return output.join("\n");
}
