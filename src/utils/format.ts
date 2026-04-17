export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "∞";
  return value.toFixed(decimals);
}

