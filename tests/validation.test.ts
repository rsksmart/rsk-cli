import { describe, expect, it } from "vitest";
import {
  buildPairs,
  parseAndValidateMaxPairs,
  parseRepoIdentifier,
  validateContractAddress,
  validateOutputFormat,
  validateRepo,
} from "../src/utils/devmetrics/validation.js";

describe("devmetrics validation", () => {
  it("validates repo format", () => {
    expect(validateRepo("owner/repo").valid).toBe(true);
    expect(validateRepo("badrepo").valid).toBe(false);
  });

  it("validates contract address format", () => {
    expect(validateContractAddress("0x1234567890abcdef1234567890abcdef12345678").valid).toBe(true);
    expect(validateContractAddress("0xabc").valid).toBe(false);
  });

  it("validates output format", () => {
    expect(validateOutputFormat("table")).toBe(true);
    expect(validateOutputFormat("json")).toBe(true);
    expect(validateOutputFormat("markdown")).toBe(true);
    expect(validateOutputFormat("xml")).toBe(false);
  });

  it("parses repo defensively", () => {
    expect(parseRepoIdentifier("foo/bar")).toEqual({ owner: "foo", repo: "bar" });
    expect(parseRepoIdentifier("foo")).toHaveProperty("error");
  });

  it("builds repo/contract pairs", () => {
    expect(buildPairs(["a/b"], ["0x1", "0x2"]).pairs).toHaveLength(2);
    expect(buildPairs(["a/b", "c/d"], ["0x1"]).pairs).toHaveLength(2);
    expect(buildPairs(["a/b", "c/d"], ["0x1", "0x2"]).pairs).toHaveLength(2);
    expect(buildPairs(["a/b", "c/d"], ["0x1", "0x2", "0x3"]).error).toBeDefined();
  });

  it("validates max-pairs bounds", () => {
    expect(parseAndValidateMaxPairs("10").maxPairs).toBe(10);
    expect(parseAndValidateMaxPairs("0").error).toBeDefined();
    expect(parseAndValidateMaxPairs("26").error).toBeDefined();
  });
});
