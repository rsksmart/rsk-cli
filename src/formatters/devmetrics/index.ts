import { DevMetricsReport, DevMetricsOutputFormat } from "../../types/devmetrics.js";
import { formatAsJSON } from "./json.js";
import { formatAsMarkdown } from "./markdown.js";
import { formatAsTable } from "./table.js";

export function formatDevMetricsReport(
  reports: DevMetricsReport[],
  format: DevMetricsOutputFormat
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
