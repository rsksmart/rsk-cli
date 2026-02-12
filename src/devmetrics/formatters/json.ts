import { DevMetricsReport } from "../types.js";

export function formatDevMetricsAsJSON(reports: DevMetricsReport[]): string {
  return JSON.stringify(reports, null, 2);
}

