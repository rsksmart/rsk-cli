import Table from "cli-table3";
import chalk from "chalk";
import type { DevMetricsReport } from "../types.js";

export function formatAsTable(reports: DevMetricsReport[]): string {
  const lines: string[] = [];

  for (const report of reports) {
    lines.push(
      chalk.bold.cyan(`\n📊 Report for ${report.repository}`)
    );
    lines.push(chalk.gray(`   Contract : ${report.contractAddress}`));
    lines.push(
      chalk.gray(
        `   Generated: ${new Date(report.timestamp).toLocaleString()}\n`
      )
    );

    // ── GitHub ──────────────────────────────────────────────────────────────
    const ghTable = new Table({
      head: [chalk.blue("GitHub Metrics"), chalk.yellow("Value")],
      style: { head: [], border: [] },
    });

    ghTable.push(
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
      [
        "👥 Contributors",
        chalk.white(report.github.contributorCount.toString()),
      ]
    );

    lines.push(ghTable.toString());

    // ── Rootstock ────────────────────────────────────────────────────────────
    const rskTable = new Table({
      head: [chalk.blue("Rootstock Metrics"), chalk.yellow("Value")],
      style: { head: [], border: [] },
    });

    if (report.rootstock.note) {
      rskTable.push([
        { colSpan: 2, content: chalk.yellow(`⚠️  ${report.rootstock.note}`) },
      ]);
    }

    rskTable.push(
      [
        "📦 Deployment Block",
        report.rootstock.deploymentBlock != null
          ? chalk.white(report.rootstock.deploymentBlock.toLocaleString())
          : chalk.gray("N/A"),
      ],
      [
        "📊 Total Txs (est.)",
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
          : chalk.gray("N/A"),
      ],
      [
        "⛽ Avg Gas Used",
        chalk.white(
          report.rootstock.gasUsagePatterns.average.toLocaleString()
        ),
      ],
      [
        "⛽ Min Gas Used",
        chalk.white(report.rootstock.gasUsagePatterns.min.toLocaleString()),
      ],
      [
        "⛽ Max Gas Used",
        chalk.white(report.rootstock.gasUsagePatterns.max.toLocaleString()),
      ]
    );

    lines.push("\n" + rskTable.toString());

    if (reports.length > 1) lines.push("");
  }

  return lines.join("\n");
}
