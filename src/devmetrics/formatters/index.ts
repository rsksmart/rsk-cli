import type { DevMetricsReport, OutputFormat } from "../types.js";
import { formatAsTable } from "./tableFormatter.js";
import { formatAsJSON } from "./jsonFormatter.js";
import { formatAsMarkdown } from "./markdownFormatter.js";

export function formatReport(
  reports: DevMetricsReport[],
  format: OutputFormat
): string {
  switch (format) {
    case "json":
      return formatAsJSON(reports);
    case "markdown":
      return formatAsMarkdown(reports);
    case "table":
    default:
      return formatAsTable(reports);
  }
}
