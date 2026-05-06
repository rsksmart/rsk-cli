import dns from "node:dns/promises";
import net from "node:net";

type RpcValidationOptions = {
  allowPrivateRpc?: boolean;
};

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3];
}

function isInCidr(ip: string, cidrBase: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1) >>> 0);
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(cidrBase) & mask);
}

function isDisallowedIpv4(ip: string, allowPrivateRpc: boolean): boolean {
  if (ip === "169.254.169.254") return true;

  const alwaysBlockedCidrs: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["169.254.0.0", 16],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  const privateCidrs: Array<[string, number]> = [
    ["127.0.0.0", 8],
    ["10.0.0.0", 8],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
  ];

  if (alwaysBlockedCidrs.some(([base, bits]) => isInCidr(ip, base, bits))) return true;
  if (!allowPrivateRpc && privateCidrs.some(([base, bits]) => isInCidr(ip, base, bits))) return true;
  return false;
}

function isDisallowedIpv6(rawIp: string, allowPrivateRpc: boolean): boolean {
  const ip = rawIp.toLowerCase();
  if (ip === "::") return true;
  if (!allowPrivateRpc && ip === "::1") return true;
  if (ip.startsWith("fe80:")) return true;
  if (!allowPrivateRpc && (ip.startsWith("fc") || ip.startsWith("fd"))) return true;

  if (ip.startsWith("::ffff:")) {
    const mapped = ip.replace("::ffff:", "");
    if (net.isIPv4(mapped)) return isDisallowedIpv4(mapped, allowPrivateRpc);
  }

  return false;
}

function isDisallowedIp(ip: string, allowPrivateRpc: boolean): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isDisallowedIpv4(ip, allowPrivateRpc);
  if (version === 6) return isDisallowedIpv6(ip, allowPrivateRpc);
  return false;
}

function baseUrlError(rawUrl: string, reason: string): Error {
  return new Error(`Invalid RPC URL "${rawUrl}": ${reason}`);
}

export function validateRpcUrlLiteral(rawUrl: string, options: RpcValidationOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw baseUrlError(rawUrl, "must be a valid absolute URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw baseUrlError(rawUrl, "only http and https schemes are allowed");
  }

  if (!parsed.hostname) {
    throw baseUrlError(rawUrl, "hostname is required");
  }

  const isLiteralIp = net.isIP(parsed.hostname) !== 0;
  if (isLiteralIp && isDisallowedIp(parsed.hostname, !!options.allowPrivateRpc)) {
    throw baseUrlError(rawUrl, "target IP range is blocked by SSRF policy");
  }

  return parsed;
}

export async function validateRpcUrl(rawUrl: string, options: RpcValidationOptions = {}): Promise<URL> {
  const parsed = validateRpcUrlLiteral(rawUrl, options);
  const hostname = parsed.hostname;

  if (net.isIP(hostname) !== 0) return parsed;

  let records: Array<{ address: string; family: number }>;
  try {
    records = (await dns.lookup(hostname, { all: true })) as Array<{ address: string; family: number }>;
  } catch {
    throw baseUrlError(rawUrl, "hostname could not be resolved");
  }

  if (records.length === 0) {
    throw baseUrlError(rawUrl, "hostname resolved to no addresses");
  }

  const allowPrivateRpc = !!options.allowPrivateRpc;
  const hasBlockedAddress = records.some((record) => isDisallowedIp(record.address, allowPrivateRpc));
  if (hasBlockedAddress) {
    throw baseUrlError(rawUrl, "hostname resolves to a blocked private or local address");
  }

  return parsed;
}

export function redactRpcUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";

    const sensitiveQueryKeys = ["key", "api_key", "apikey", "token", "access_token", "auth", "secret"];
    const queryEntries = [...parsed.searchParams.entries()];
    for (const [key, value] of queryEntries) {
      const lowerKey = key.toLowerCase();
      const isSensitiveKey = sensitiveQueryKeys.includes(lowerKey);
      const looksLikeSecretValue =
        value.length >= 20 && /^[A-Za-z0-9._-]+$/.test(value) && !/^(true|false|\d+)$/i.test(value);

      if (isSensitiveKey || looksLikeSecretValue) {
        parsed.searchParams.set(key, "****");
      }
    }

    parsed.pathname = parsed.pathname
      .replace(/\/v3\/[^/]+/i, "/v3/****")
      .replace(/\/(api[-_]?key|token)\/[^/]+/gi, "/$1/****");

    return parsed.toString();
  } catch {
    return "invalid-rpc-url";
  }
}
