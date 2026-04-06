import { Command } from "commander";
import { riskSimulateCommand } from "./simulate.js";
import { riskSandboxCommand } from "./sandbox.js";
import { riskReportCommand } from "./report.js";

export function registerRiskCommands(program: Command): void {
  const risk = program
    .command("risk")
    .description("Liquidation stress testing and risk analysis for Rootstock DeFi protocols");

  risk
    .command("simulate")
    .description("Simulate liquidation cascades under price shocks")
    .requiredOption("--shock <percentage>", "Price shock percentage to apply", (value: string) =>
      parseFloat(value)
    )
    .option("--asset <symbol>", "Limit the shock to a specific asset (e.g. rbtc)")
    .action(async (options: { shock: number; asset?: string }) => {
      await riskSimulateCommand({
        shock: options.shock,
        asset: options.asset,
        isExternal: false,
      });
    });

  risk
    .command("sandbox")
    .description("Experiment with custom LTV and liquidation thresholds")
    .option("--ltv <percentage>", "Maximum LTV (e.g. 65 for 65%)", (value: string) =>
      parseFloat(value)
    )
    .option(
      "--threshold <percentage>",
      "Liquidation threshold (e.g. 80 for 80%)",
      (value: string) => parseFloat(value)
    )
    .action(async (options: { ltv?: number; threshold?: number }) => {
      await riskSandboxCommand({
        ltv: options.ltv,
        threshold: options.threshold,
        isExternal: false,
      });
    });

  risk
    .command("report")
    .description("Generate structured risk reports for CI/CD and monitoring")
    .option(
      "--format <format>",
      "Output format: json|table (default: json)",
      "json"
    )
    .option(
      "--shock <percentage>",
      "Price shock percentage to apply (default: 40)",
      (value: string) => parseFloat(value)
    )
    .action(async (options: { format?: string; shock?: number }) => {
      const fmt = options.format === "table" ? "table" : "json";
      await riskReportCommand({
        format: fmt,
        shock: options.shock,
        isExternal: false,
      });
    });
}

