import { describe, expect, it } from "vitest";
import { PayloadTooLargeError, isJsonRequest, readJson } from "../src/lib/request";

describe("bounded JSON bodies", () => {
  it("parses an object and rejects arrays/scalars", async () => {
    const ok = new Request("https://example.com/api", { method: "POST", body: JSON.stringify({ a: 1 }) });
    await expect(readJson(ok, 1024)).resolves.toEqual({ a: 1 });
    const arr = new Request("https://example.com/api", { method: "POST", body: "[1,2]" });
    await expect(readJson(arr, 1024)).rejects.toBeTruthy();
    const scalar = new Request("https://example.com/api", { method: "POST", body: "42" });
    await expect(readJson(scalar, 1024)).rejects.toBeTruthy();
  });

  it("rejects a declared or actual oversized body", async () => {
    const declared = new Request("https://example.com/api", {
      method: "POST",
      headers: { "content-length": "5000" },
      body: "{}",
    });
    await expect(readJson(declared, 1024)).rejects.toBeInstanceOf(PayloadTooLargeError);

    const actual = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(2000) }),
    });
    await expect(readJson(actual, 1024)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("https://example.com/api", { method: "POST", body: "{nope" });
    await expect(readJson(bad, 1024)).rejects.toBeTruthy();
  });

  it("only treats JSON media types as JSON", () => {
    const json = new Request("https://example.com/api", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: "{}",
    });
    const plain = new Request("https://example.com/api", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });
    const missing = new Request("https://example.com/api", { method: "POST", body: "{}" });
    expect(isJsonRequest(json)).toBe(true);
    expect(isJsonRequest(plain)).toBe(false);
    expect(isJsonRequest(missing)).toBe(false);
  });
});
