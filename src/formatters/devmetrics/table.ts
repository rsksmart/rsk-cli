import Table from "cli-table3";
import chalk from "chalk";
import { DevMetricsReport } from "../../types/devmetrics.js";

export function formatAsTable(reports: DevMetricsReport[]): string {
  const output: string[] = [];

  for (const report of reports) {
    output.push(chalk.bold.cyan(`\nReport for ${report.repository}`));
    output.push(chalk.gray(`Contract: ${report.contractAddress}`));
    output.push(chalk.gray(`Generated: ${new Date(report.timestamp).toLocaleString()}\n`));

    const githubTable = new Table({
      head: [chalk.blue("GitHub Metrics"), chalk.yellow("Value")],
      style: { head: [], border: [] },
    });

    githubTable.push(
      ["Stars", String(report.github.stars)],
      ["Last Commit", report.github.lastCommitDate ? new Date(report.github.lastCommitDate).toLocaleDateString() : "N/A"],
      ["Open Issues", String(report.github.openIssuesCount)],
      ["Open PRs", String(report.github.pullRequestsCount)],
      ["Contributors", String(report.github.contributorCount)]
    );

    const rootstockTable = new Table({
      head: [chalk.blue("Rootstock Metrics"), chalk.yellow("Value")],
      style: { head: [], border: [] },
    });

    rootstockTable.push(
      ["Deployment Block", report.rootstock.deploymentBlock?.toString() || "N/A"],
      ["Total Transactions", String(report.rootstock.totalTransactionCount)],
      [
        "Last Transaction",
        report.rootstock.lastTransactionTimestamp
          ? new Date(report.rootstock.lastTransactionTimestamp).toLocaleDateString()
          : "N/A",
      ],
      ["Avg Gas Usage", report.rootstock.gasUsagePatterns.average.toLocaleString()],
      ["Min Gas Usage", report.rootstock.gasUsagePatterns.min.toLocaleString()],
      ["Max Gas Usage", report.rootstock.gasUsagePatterns.max.toLocaleString()]
    );

    output.push(githubTable.toString());
    output.push("\n" + rootstockTable.toString());
  }

  return output.join("\n");
}
