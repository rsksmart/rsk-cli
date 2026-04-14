import { describe, it, expect } from "vitest";
import {
  validateRepo,
  validateContractAddress,
} from "../utils/devmetricsValidation.js";

// ─── validateRepo ─────────────────────────────────────────────────────────────

describe("validateRepo", () => {
  describe("valid inputs", () => {
    it("accepts a standard owner/repo", () => {
      expect(validateRepo("rsksmart/rsk-cli")).toEqual({ valid: true });
    });

    it("accepts names with hyphens", () => {
      expect(validateRepo("my-org/my-repo")).toEqual({ valid: true });
    });

    it("accepts names with underscores", () => {
      expect(validateRepo("my_org/my_repo")).toEqual({ valid: true });
    });

    it("accepts names with dots", () => {
      expect(validateRepo("my.org/my.repo")).toEqual({ valid: true });
    });

    it("accepts numeric owner or repo name", () => {
      expect(validateRepo("org123/repo456")).toEqual({ valid: true });
    });

    it("accepts mixed alphanumeric with hyphens and dots", () => {
      expect(validateRepo("org-name.v2/repo-name.v3")).toEqual({ valid: true });
    });
  });

  describe("invalid inputs", () => {
    it("rejects a bare repo name without owner", () => {
      const result = validateRepo("rsk-cli");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("rejects an empty string", () => {
      expect(validateRepo("").valid).toBe(false);
    });

    it("rejects a full GitHub URL", () => {
      expect(validateRepo("https://github.com/rsksmart/rsk-cli").valid).toBe(false);
    });

    it("rejects trailing slash", () => {
      expect(validateRepo("rsksmart/").valid).toBe(false);
    });

    it("rejects leading slash", () => {
      expect(validateRepo("/rsk-cli").valid).toBe(false);
    });

    it("rejects spaces", () => {
      expect(validateRepo("rsksmart/ rsk-cli").valid).toBe(false);
    });

    it("returns an error message on failure", () => {
      const result = validateRepo("bad-input");
      expect(typeof result.error).toBe("string");
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });
});

// ─── validateContractAddress ──────────────────────────────────────────────────

describe("validateContractAddress", () => {
  describe("valid inputs", () => {
    it("accepts a lowercase hex address", () => {
      expect(
        validateContractAddress("0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d")
      ).toEqual({ valid: true });
    });

    it("accepts an uppercase hex address", () => {
      expect(
        validateContractAddress("0x9158C22B1799A2527CE8B95F9F1FF5E133FBA27D")
      ).toEqual({ valid: true });
    });

    it("accepts a mixed-case hex address", () => {
      expect(
        validateContractAddress("0xAbCdEf1234567890AbCdEf1234567890AbCdEf12")
      ).toEqual({ valid: true });
    });

    it("accepts the zero address", () => {
      expect(
        validateContractAddress("0x0000000000000000000000000000000000000000")
      ).toEqual({ valid: true });
    });
  });

  describe("invalid inputs", () => {
    it("rejects a missing 0x prefix", () => {
      expect(
        validateContractAddress("9158c22b1799a2527ce8b95f9f1ff5e133fba27d")
          .valid
      ).toBe(false);
    });

    it("rejects an address that is too short", () => {
      expect(validateContractAddress("0x1234").valid).toBe(false);
    });

    it("rejects an address that is too long", () => {
      expect(
        validateContractAddress(
          "0x9158c22b1799a2527ce8b95f9f1ff5e133fba27d00"
        ).valid
      ).toBe(false);
    });

    it("rejects non-hex characters", () => {
      expect(
        validateContractAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")
          .valid
      ).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(validateContractAddress("").valid).toBe(false);
    });

    it("rejects a plain Ethereum ENS name", () => {
      expect(validateContractAddress("vitalik.eth").valid).toBe(false);
    });

    it("returns an error message on failure", () => {
      const result = validateContractAddress("notanaddress");
      expect(typeof result.error).toBe("string");
      expect(result.error!.length).toBeGreaterThan(0);
    });
  });
});
