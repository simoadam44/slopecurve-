import { describe, it, expect } from "vitest";
import { sanitizeRichText } from "../src/lib/seo";

function expectInert(html: string) {
  const out = sanitizeRichText(html).toLowerCase();
  expect(out).not.toMatch(/<script|<style|<svg|<math|<iframe|<object|<embed|<form|<template|<meta|<link/i);
  expect(out).not.toMatch(/\son[a-z]+\s*=/i);
  expect(out).not.toContain("javascript:");
  expect(out).not.toContain("vbscript:");
  expect(out).not.toContain("data:");
  expect(out).not.toContain("srcdoc");
  expect(out).not.toContain("style=");
  expect(out).not.toContain("evil.com");
  return out;
}

describe("rich text sanitizer", () => {
  it("rejects malformed tag separators used to smuggle event handlers", () => {
    expectInert('<img/src=x onerror="alert(1)">');
    expectInert('<img/src=x/onerror=alert(1)>');
    expectInert('<svg/onload=alert(1)>');
    expectInert('<math><mtext><img src=x onerror=alert(1)></mtext></math>');
    expectInert('<template><img src=x onerror=alert(1)></template>');
  });

  it("rejects encoded and protocol-relative URLs", () => {
    expectInert('<a href="jav&#x09;ascript:alert(1)">x</a>');
    expectInert('<a href="java&#115;cript:alert(1)">x</a>');
    expectInert('<a href="//evil.com/x">x</a>');
    expectInert('<a href="/\\evil.com">x</a>');
    expectInert('<a href="https://example.com" style="background:url(//evil.com)">x</a>');
  });

  it("rejects data images and unknown attributes", () => {
    expectInert('<img src="data:image/svg+xml,<svg onload=alert(1)>">');
    expectInert('<img src="x" onerror="alert(1)" width="1" height="1">');
    expectInert('<p id="x" class="y" data-x="z">ok</p>');
  });

  it("keeps the supported content model", () => {
    const out = sanitizeRichText(
      '<h2>Title</h2><p><strong>Bold</strong> <em>italic</em></p><ul><li>One</li></ul><a href="/games/snow-road">internal</a><img src="https://cdn.example.com/x.jpg" alt="game">',
    );
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<ul><li>One</li></ul>");
    expect(out).toContain('<a href="/games/snow-road"');
    expect(out).toContain('<img src="https://cdn.example.com/x.jpg" alt="game"');
  });

  it("forces safe rel on external links", () => {
    const out = sanitizeRichText('<a href="https://example.com/x">ext</a>');
    expect(out).toMatch(/rel="[^"]*noopener/);
    expect(out).toMatch(/rel="[^"]*noreferrer/);
  });
});
