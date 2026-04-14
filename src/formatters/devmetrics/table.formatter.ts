import Table from "cli-table3";
import chalk from "chalk";
import { DevMetricsReport } from "../../utils/types.js";

export function formatAsTable(reports: DevMetricsReport[]): string {
  const output: string[] = [];

  for (const report of reports) {
    output.push(chalk.bold.cyan(`\n📊 Report for ${report.repository}`));
    output.push(chalk.gray(`Contract: ${report.contractAddress}`));
    output.push(
      chalk.gray(`Generated: ${new Date(report.timestamp).toLocaleString()}\n`)
    );

    const githubTable = new Table({
      head: [chalk.blue("GitHub Metrics"), chalk.yellow("Value")],
      style: { head: [], border: [] },
    });

    githubTable.push(
      ["⭐ Stars", chalk.white(report.github.stars.toString())],
      [
        "📝 Last Commit",
        report.github.lastCommitDate
          ? chalk.green(
              new Date(report.github.lastCommitDate).toLocaleDateString()
            )
          : chalk.red("N/A"),
      ],
      ["🐛 Open Issues", chalk.white(report.github.openIssuesCount.toString())],
      ["🔀 Open PRs", chalk.white(report.github.pullRequestsCount.toString())],
      ["👥 Contributors", chalk.white(report.github.contributorCount.toString())]
    );

    output.push(githubTable.toString());

    const rootstockTable = new Table({
      head: [chalk.blue("Rootstock Metrics"), chalk.yellow("Value")],
      style: { head: [], border: [] },
    });

    rootstockTable.push(
      [
        "📦 Deployment Block",
        report.rootstock.deploymentBlock !== null
          ? chalk.white(report.rootstock.deploymentBlock.toString())
          : chalk.red("N/A"),
      ],
      [
        "📊 Total Transactions",
        chalk.white(report.rootstock.totalTransactionCount.toString()),
      ],
      [
        "⏰ Last Transaction",
        report.rootstock.lastTransactionTimestamp
          ? chalk.green(
              new Date(
                report.rootstock.lastTransactionTimestamp
              ).toLocaleDateString()
            )
          : chalk.red("N/A"),
      ],
      [
        "⛽ Avg Gas Usage",
        chalk.white(
          report.rootstock.gasUsagePatterns.average.toLocaleString()
        ),
      ],
      [
        "⛽ Min Gas Usage",
        chalk.white(report.rootstock.gasUsagePatterns.min.toLocaleString()),
      ],
      [
        "⛽ Max Gas Usage",
        chalk.white(report.rootstock.gasUsagePatterns.max.toLocaleString()),
      ]
    );

    output.push("\n" + rootstockTable.toString());
  }

  return output.join("\n");
}
