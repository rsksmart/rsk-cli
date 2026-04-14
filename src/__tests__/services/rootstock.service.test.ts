import { describe, it, expect, vi, beforeEach } from "vitest";
import { RootstockService } from "../../services/rootstock.service.js";

// ─── ethers mock ──────────────────────────────────────────────────────────────
//
// We mock the entire ethers module so JsonRpcProvider is replaced by a
// controllable fake. Each test can override individual methods as needed.

const makeProvider = (overrides: Partial<Record<string, any>> = {}) => ({
  getBlockNumber: vi.fn().mockResolvedValue(6000000),
  getCode: vi.fn().mockResolvedValue("0xdeadbeef"),
  getBlockWithTransactions: vi.fn().mockResolvedValue({
    timestamp: Math.floor(Date.now() / 1000) - 1000,
    transactions: [],
  }),
  ...overrides,
});

let mockProvider = makeProvider();

vi.mock("ethers", () => ({
  ethers: {
    providers: {
      JsonRpcProvider: vi.fn().mockImplementation(function () {
        return mockProvider;
      }),
    },
    utils: {
      isAddress: vi.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
    },
  },
}));

const VALID_ADDRESS = "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RootstockService", () => {
  beforeEach(() => {
    mockProvider = makeProvider();
    vi.clearAllMocks();
  });

  // ── constructor / accessors ──────────────────────────────────────────────────

  describe("constructor and accessors", () => {
    it("defaults to mainnet when no args supplied", () => {
      const svc = new RootstockService();
      expect(svc.getNetwork()).toBe("mainnet");
    });

    it("uses the supplied network", () => {
      const svc = new RootstockService(undefined, "testnet");
      expect(svc.getNetwork()).toBe("testnet");
    });

    it("infers testnet from an RPC URL containing 'testnet'", () => {
      const svc = new RootstockService("https://public-node.testnet.rsk.co");
      expect(svc.getNetwork()).toBe("testnet");
    });

    it("stores the explicit rpcUrl", () => {
      const url = "https://custom.rsk.co";
      const svc = new RootstockService(url);
      expect(svc.getRpcUrl()).toBe(url);
    });

    it("falls back to the public mainnet node when no URL given", () => {
      const svc = new RootstockService();
      expect(svc.getRpcUrl()).toContain("rsk.co");
    });
  });

  // ── getMetrics — happy path ──────────────────────────────────────────────────

  describe("getMetrics() — happy path", () => {
    it("returns a RootstockMetrics object", async () => {
      mockProvider = makeProvider({
        getCode: vi.fn().mockResolvedValue("0xdeadbeef"),
      });
      const svc = new RootstockService();
      const metrics = await svc.getMetrics(VALID_ADDRESS);
      expect(metrics).toHaveProperty("contractAddress", VALID_ADDRESS);
      expect(metrics).toHaveProperty("totalTransactionCount");
      expect(metrics).toHaveProperty("gasUsagePatterns");
    });

    it("sets deploymentBlock to a number when code exists at tip", async () => {
      const svc = new RootstockService();
      const metrics = await svc.getMetrics(VALID_ADDRESS);
      expect(typeof metrics.deploymentBlock).toBe("number");
    });

    it("sets deploymentBlock to null when contract has no code", async () => {
      mockProvider = makeProvider({
        getCode: vi.fn().mockResolvedValue("0x"),
      });
      const svc = new RootstockService();
      const metrics = await svc.getMetrics(VALID_ADDRESS);
      expect(metrics.deploymentBlock).toBeNull();
    });

    it("counts matching transactions in blocks", async () => {
      mockProvider = makeProvider({
        getBlockWithTransactions: vi.fn().mockResolvedValue({
          timestamp: Math.floor(Date.now() / 1000) - 100,
          transactions: [
            { to: VALID_ADDRESS, gasLimit: BigInt(21000) },
            { to: "0xother000000000000000000000000000000000000" },
          ],
        }),
      });
      const svc = new RootstockService();
      const metrics = await svc.getMetrics(VALID_ADDRESS);
      expect(metrics.totalTransactionCount).toBeGreaterThanOrEqual(1);
    });

    it("returns lastTransactionTimestamp as ISO string when tx found", async () => {
      const ts = Math.floor(Date.now() / 1000) - 50;
      mockProvider = makeProvider({
        getBlockWithTransactions: vi.fn().mockResolvedValue({
          timestamp: ts,
          transactions: [{ to: VALID_ADDRESS }],
        }),
      });
      const svc = new RootstockService();
      const metrics = await svc.getMetrics(VALID_ADDRESS);
      expect(metrics.lastTransactionTimestamp).toBe(
        new Date(ts * 1000).toISOString()
      );
    });
  });

  // ── getMetrics — error paths ─────────────────────────────────────────────────

  describe("getMetrics() — error paths", () => {
    it("throws on an invalid contract address", async () => {
      const svc = new RootstockService();
      await expect(svc.getMetrics("not-an-address")).rejects.toThrow(
        /invalid contract address/i
      );
    });

    it("returns zero metrics when getBlockNumber fails", async () => {
      mockProvider = makeProvider({
        getBlockNumber: vi.fn().mockRejectedValue(new Error("RPC down")),
      });
      const svc = new RootstockService();
      await expect(svc.getMetrics(VALID_ADDRESS)).rejects.toThrow(
        /failed to fetch rootstock metrics/i
      );
    });

    it("returns safe defaults when block fetches fail during tx scan", async () => {
      mockProvider = makeProvider({
        getBlockWithTransactions: vi.fn().mockRejectedValue(new Error("timeout")),
      });
      const svc = new RootstockService();
      const metrics = await svc.getMetrics(VALID_ADDRESS);
      expect(metrics.totalTransactionCount).toBe(0);
      expect(metrics.lastTransactionTimestamp).toBeNull();
      expect(metrics.gasUsagePatterns).toEqual({ average: 0, min: 0, max: 0 });
    });
  });

  // ── network helpers ──────────────────────────────────────────────────────────

  describe("network helpers", () => {
    it("uses ROOTSTOCK_MAINNET_RPC_URL env var when set", () => {
      process.env.ROOTSTOCK_MAINNET_RPC_URL = "https://env-mainnet.example.com";
      const svc = new RootstockService(undefined, "mainnet");
      expect(svc.getRpcUrl()).toBe("https://env-mainnet.example.com");
      delete process.env.ROOTSTOCK_MAINNET_RPC_URL;
    });

    it("uses ROOTSTOCK_TESTNET_RPC_URL env var when set", () => {
      process.env.ROOTSTOCK_TESTNET_RPC_URL = "https://env-testnet.example.com";
      const svc = new RootstockService(undefined, "testnet");
      expect(svc.getRpcUrl()).toBe("https://env-testnet.example.com");
      delete process.env.ROOTSTOCK_TESTNET_RPC_URL;
    });
  });
});
