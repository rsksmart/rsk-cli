import { DevMetricsReport, OutputFormat } from "../../utils/types.js";
import { formatAsTable } from "./table.formatter.js";
import { formatAsJSON } from "./json.formatter.js";
import { formatAsMarkdown } from "./markdown.formatter.js";

export function formatReport(
  reports: DevMetricsReport[],
  format: OutputFormat
): string {
  switch (format) {
    case "table":
      return formatAsTable(reports);
    case "json":
      return formatAsJSON(reports);
    case "markdown":
      return formatAsMarkdown(reports);
    default:
      return formatAsTable(reports);
  }
}
