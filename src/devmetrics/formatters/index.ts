import { DevMetricsReport, OutputFormat } from "../types.js";
import { formatDevMetricsAsTable } from "./table.js";
import { formatDevMetricsAsJSON } from "./json.js";
import { formatDevMetricsAsMarkdown } from "./markdown.js";

export function formatDevMetricsReport(
  reports: DevMetricsReport[],
  format: OutputFormat,
): string {
  switch (format) {
    case "table":
      return formatDevMetricsAsTable(reports);
    case "json":
      return formatDevMetricsAsJSON(reports);
    case "markdown":
      return formatDevMetricsAsMarkdown(reports);
    default:
      return formatDevMetricsAsTable(reports);
  }
}

