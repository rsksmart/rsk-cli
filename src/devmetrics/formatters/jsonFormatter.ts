import type { DevMetricsReport } from "../types.js";

export function formatAsJSON(reports: DevMetricsReport[]): string {
  return JSON.stringify(reports, null, 2);
}
