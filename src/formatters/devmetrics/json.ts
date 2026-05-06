import { DevMetricsReport } from "../../types/devmetrics.js";

export function formatAsJSON(reports: DevMetricsReport[]): string {
  return JSON.stringify(reports, null, 2);
}
