import { describe, it, expect } from "vitest";
import { checkQuality, keywordCollisions, normalizeKeyword, similarity, wordCount, closestMatch, parseSectionsHtml } from "../src/lib/aiContent";
import { DEFAULT_MODEL, FREE_MODELS, VERIFIED_FREE_MODELS, DEPRECATED_MODELS, PAID_ONLY_MODELS, fallbackChain, isFreeModel, isRetryableModelError, isSafeModelId, modelMeta } from "../src/lib/aiModels";
import { buildGameCopyPrompt, buildPostPrompt, buildLandingPrompt, buildKeywordsPrompt, buildOutlinePrompt, buildIntentPrompt, extractJson, sectionsToHtml, WRITING_RULES, LANDING_SCHEMA } from "../src/lib/aiPrompt";
import { decryptSecret, encryptSecret, keyHint, validApiKeyFormat } from "../src/lib/aiCrypto";
import { aiErrorMessage, classifyGeminiError, isRetryableCode } from "../src/lib/aiErrors";
import { rankInternalLinks, relatedLinksHtml, internalPath } from "../src/lib/internalLinks";

const unique = (prefix: string) =>
  `${prefix} rewards patient cornering and a light touch on the throttle. ` +
  "Coasting before the ramp keeps the sled level so you clear the frozen lake instead of sliding into it. " +
  "Chain three clean landings in a row and the route opens a shortcut through the pine tunnel. " +
  "Most attempts fail because players brake too late, not because the course is unfair. " +
  "Practise the first two turns until the rhythm feels automatic, then push the speed. ";

describe("similarity engine", () => {
  it("scores near-identical text high and unrelated text low", () => {
    const a = unique("Snow Rider");
    const b = unique("Snow Rider");
    expect(similarity(a, b)).toBeGreaterThan(0.9);
    const c = "A totally different article about cooking pasta with tomato sauce and fresh basil leaves on a Tuesday evening.";
    expect(similarity(a, c)).toBeLessThan(0.05);
  });

  it("counts words ignoring HTML", () => {
    expect(wordCount("<h2>Hello</h2><p>there brave world</p>")).toBe(4);
  });

  it("closestMatch picks the most similar candidate", () => {
    const cands = [{ id: "1", label: "A", text: unique("Snow Rider") }, { id: "2", label: "B", text: "cooking pasta with basil" }];
    expect(closestMatch(unique("Snow Rider"), cands)?.id).toBe("1");
  });
});

describe("quality gate", () => {
  const cfg = { minWords: 30, maxSimilarity: 0.35 };

  it("passes original, substantial content", () => {
    const r = checkQuality(unique("Snow Rider"), [{ id: "x", label: "Other game", text: "cooking pasta with basil and garlic" }], cfg);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("blocks thin content", () => {
    const r = checkQuality("Play now. Fun game!", [], cfg);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Too thin/);
  });

  it("blocks near-duplicate content and names the conflicting page", () => {
    const r = checkQuality(unique("Snow Rider"), [{ id: "dup", label: "Snow Road", text: unique("Snow Rider") }], cfg);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Too similar to "Snow Road"/);
    expect(r.closest?.id).toBe("dup");
  });
});

describe("keyword cannibalization", () => {
  it("flags an exact re-target of an existing page keyword", () => {
    const k = keywordCollisions("Best snow games", [{ id: "p1", label: "Snow guide", keyword: "best snow games" }]);
    expect(k).toHaveLength(1);
    expect(k[0].label).toBe("Snow guide");
    expect(normalizeKeyword("  Best   SNOW games! ")).toBe("best snow games");
    expect(keywordCollisions("", [{ id: "p1", label: "x", keyword: "" }])).toEqual([]);
  });
});

describe("free-model policy", () => {
  it("accepts the default and every allowlisted model", () => {
    expect(isFreeModel(DEFAULT_MODEL)).toBe(true);
    for (const m of FREE_MODELS) expect(isFreeModel(m)).toBe(true);
    expect(FREE_MODELS.length).toBe(VERIFIED_FREE_MODELS.length);
  });

  it("every allowlisted id is marked verified-free in metadata", () => {
    for (const m of FREE_MODELS) {
      const meta = modelMeta(m);
      expect(meta?.tier).toBe("free");
      expect(isSafeModelId(m)).toBe(true);
    }
    expect(modelMeta(DEFAULT_MODEL)?.status).toBe("ga");
  });

  it("rejects deprecated auto-routing models", () => {
    for (const m of DEPRECATED_MODELS) expect(isFreeModel(m)).toBe(false);
    expect(isFreeModel("gemini-3.7-flash")).toBe(false);
    expect(isFreeModel("gemini-3.5-flash")).toBe(false);
  });

  it("rejects paid-only, pro, image and audio models", () => {
    for (const m of PAID_ONLY_MODELS) expect(isFreeModel(m)).toBe(false);
    expect(isFreeModel("gemini-3.1-pro-preview")).toBe(false);
    expect(isFreeModel("gemini-3-pro-image")).toBe(false);
    expect(isFreeModel("veo-3.1-generate-preview")).toBe(false);
    expect(isFreeModel("gemini-omni-1.1-flash")).toBe(false);
  });

  it("rejects preview and access-limited models (not in the verified set)", () => {
    expect(isFreeModel("gemini-3-flash-preview")).toBe(false);
    expect(isFreeModel("gemini-2.5-flash")).toBe(false);
    expect(isFreeModel("gemini-2.5-flash-lite")).toBe(false);
  });

  it("rejects malformed/unsafe model ids (injection guard)", () => {
    expect(isSafeModelId("gemini-3.8-flash")).toBe(true);
    expect(isSafeModelId("../models/x")).toBe(false);
    expect(isSafeModelId("gemini 3.8 flash")).toBe(false);
    expect(isSafeModelId("https://evil.com")).toBe(false);
  });

  it("falls back to the default when an unknown or unverified model is requested", () => {
    expect(fallbackChain("evil-model")[0]).toBe(DEFAULT_MODEL);
    expect(fallbackChain("gemini-3.7-flash")[0]).toBe(DEFAULT_MODEL);
    expect(fallbackChain("gemini-3.5-flash-lite")[0]).toBe("gemini-3.5-flash-lite");
  });

  it("only ever returns verified-free ids in a fallback chain", () => {
    for (const m of fallbackChain("gemini-3.1-flash-lite")) {
      expect(isFreeModel(m)).toBe(true);
    }
  });

  it("treats model-unavailable and quota errors as retryable, 402 as terminal", () => {
    expect(isRetryableModelError(404, "")).toBe(true);
    expect(isRetryableModelError(429, "")).toBe(true);
    expect(isRetryableModelError(502, "RESOURCE_EXHAUSTED")).toBe(true);
    expect(isRetryableModelError(402, "insufficient balance")).toBe(false);
    expect(isRetryableModelError(502, "server exploded")).toBe(false);
  });
});

describe("prompt builders", () => {
  it("grounds the game prompt in facts, notes and anti-fabrication rules", () => {
    const p = buildGameCopyPrompt({ title: "Snow Rider", category: "Skiing", providerHost: "azgames.io", focusKeyword: "snow rider game", relatedKeywords: ["sledding"], uniqueNotes: "Ramps reset after each lake.", language: "English", sections: ["Overview", "Tips"], searchIntent: "play/transactional", gameplay: "Race down a slope avoiding trees.", controls: "Arrows to steer.", instructions: "Hold down to tuck." });
    expect(p).toContain("Snow Rider");
    expect(p).toContain("Ramps reset after each lake.");
    expect(p).toContain("play/transactional");
    expect(p).toContain("Arrows to steer.");
    expect(p).toContain("Never invent ratings");
    expect(p).toContain("Overview");
    expect(WRITING_RULES).toMatch(/keyword-stuff/);
  });

  it("grounds the guide prompt on long-tail intent", () => {
    const p = buildPostPrompt({ targetKeyword: "how to play snow rider without crashing", language: "English", intent: "informational", relatedTool: "Snow Rider", workingTitle: "No-crash guide", uniqueNotes: "Brake early on the second bend.", sections: ["Quick answer", "FAQ"] });
    expect(p).toContain("how to play snow rider without crashing");
    expect(p).toContain("Brake early on the second bend.");
    expect(p).toContain("Quick answer");
  });

  it("lists already-targeted keywords when suggesting new ones", () => {
    const p = buildKeywordsPrompt("snow games", "English", ["snow rider tips"]);
    expect(p).toContain("snow rider tips");
    expect(p).toMatch(/LONG-TAIL/);
  });

  it("grounds the landing prompt on the target keyword, game facts and notes", () => {
    const p = buildLandingPrompt({
      targetKeyword: "snow rider unblocked", gameTitle: "Snow Rider 3D", category: "", language: "English",
      intent: "play/transactional", sections: ["Quick answer", "FAQ"],
      uniqueNotes: "The sled resets after the frozen lake.", gameplay: "Dodge trees.", controls: "Arrow keys.",
    });
    expect(p).toContain("snow rider unblocked");
    expect(p).toContain("Snow Rider 3D");
    expect(p).toContain("The sled resets after the frozen lake.");
    expect(p).toContain("Arrow keys.");
    expect(p).toMatch(/Never invent ratings/);
    expect(p).toContain("Quick answer");
    expect(p).toContain("FAQ");
  });

  it("requires the landing schema's editorial fields", () => {
    const required = LANDING_SCHEMA.required as string[];
    expect(required).toEqual(expect.arrayContaining(["seo_title", "h1", "subtitle", "meta_description", "intro", "sections", "faqs", "focus_keyword", "slug_suggestion"]));
  });

  it("grounds the landing prompt in the selected tool and asks for a subtitle", () => {
    const p = buildLandingPrompt({
      targetKeyword: "snow rider video", gameTitle: "Snow Rider 3D", category: "", language: "English",
      intent: "play/transactional", sections: ["Quick answer"], toolType: "video",
      uniqueNotes: "The sled resets after the frozen lake.",
    });
    expect(p).toContain("Tool type: Video");
    expect(p).toMatch(/subtitle/i);
  });

  it("plans an outline grounded in the keyword and forbids invented data", () => {
    const p = buildOutlinePrompt({ targetKeyword: "how to play snow rider", language: "English", intent: "informational", relatedTool: "Snow Rider", workingTitle: "Snow Rider guide", uniqueNotes: "Brake before the lake." });
    expect(p).toContain("how to play snow rider");
    expect(p).toContain("Brake before the lake.");
    expect(p).toMatch(/OUTLINE/);
    expect(p).toMatch(/Do NOT write body content/);
  });

  it("classifies search intent without fabricating stats", () => {
    const p = buildIntentPrompt("play snow rider free", "English");
    expect(p).toContain("play snow rider free");
    expect(p).toMatch(/play\/transactional/);
    expect(p).toMatch(/Never invent search volume/);
  });

  it("extractJson tolerates code fences and prose", () => {
    expect(extractJson<{ a: number }>("```json\n{\"a\":1}\n```")?.a).toBe(1);
    expect(extractJson<{ a: number }>("here you go: {\"a\":2} thanks")?.a).toBe(2);
    expect(extractJson("not json at all")).toBeNull();
  });

  it("renders guide sections to allowed HTML", () => {
    const html = sectionsToHtml([{ heading: "Quick answer", body: "<p>Brake early.</p>" }]);
    expect(html).toContain("<h2>Quick answer</h2>");
    expect(html).toContain("<p>Brake early.</p>");
  });

  it("round-trips an existing article into editable sections (no content loss on edit)", () => {
    const stored = sectionsToHtml([{ heading: "Quick answer", body: "<p>Brake early.</p>" }, { heading: "FAQ", body: "<p>Yes.</p>" }]);
    const parsed = parseSectionsHtml(stored);
    expect(parsed.map((s) => s.heading)).toEqual(["Quick answer", "FAQ"]);
    expect(sectionsToHtml(parsed)).toBe(stored);
  });

  it("keeps content without h2 headings intact", () => {
    const stored = "<p>One plain paragraph without headings.</p>";
    const parsed = parseSectionsHtml(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].heading).toBe("");
    expect(parsed[0].body).toBe(stored);
  });
});

describe("key encryption at rest", () => {
  const secret = "dedicated-ai-keys-secret";
  const key = "AIzaSyExampleKey_0123456789abcdefghijklmnop";

  it("round-trips a key without storing plaintext", async () => {
    const stored = await encryptSecret(secret, key);
    expect(stored).not.toContain(key);
    expect(stored).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(await decryptSecret(secret, stored)).toBe(key);
  });

  it("uses a fresh IV so the same key encrypts differently each time", async () => {
    const a = await encryptSecret(secret, key);
    const b = await encryptSecret(secret, key);
    expect(a).not.toBe(b);
    expect(await decryptSecret(secret, b)).toBe(key);
  });

  it("returns null for the wrong secret, tampering, or bad format", async () => {
    const stored = await encryptSecret(secret, key);
    const [iv, ct] = stored.split(":");
    expect(await decryptSecret("a-different-secret", stored)).toBeNull();
    const tampered = `${iv}:${ct.slice(0, -4)}AAAA`;
    expect(await decryptSecret(secret, tampered)).toBeNull();
    expect(await decryptSecret(secret, "not-a-payload")).toBeNull();
    expect(await decryptSecret(secret, "")).toBeNull();
  });

  it("masks the key hint and never exposes the full key", () => {
    const hint = keyHint(key);
    expect(hint).toContain("…");
    expect(hint).not.toBe(key);
    expect(hint.length).toBeLessThan(key.length);
    expect(hint.includes(key.slice(0, 6))).toBe(false);
    expect(hint.endsWith(key.slice(-4))).toBe(true);
    expect(keyHint("short")).toBe("••••••");
  });

  it("validates key format without accepting junk", () => {
    // Fake fixtures only — never paste a real API key into this file.
    expect(validApiKeyFormat(key)).toBe(true);
    expect(validApiKeyFormat("AQ.FAKE_TEST_KEY_0000000000")).toBe(true);
    expect(validApiKeyFormat("AIzaSyD-Example_LegacyKey_0123456789")).toBe(true);
    expect(validApiKeyFormat("too-short")).toBe(false);
    expect(validApiKeyFormat("has spaces and is long enough!!")).toBe(false);
    expect(validApiKeyFormat("")).toBe(false);
  });
});

describe("upstream error normalization", () => {
  it("classifies provider failures into stable codes", () => {
    expect(classifyGeminiError(429, "quota exceeded")).toBe("quota_exhausted");
    expect(classifyGeminiError(429, "rate limit")).toBe("rate_limited");
    expect(classifyGeminiError(404, "model not found")).toBe("model_unavailable");
    expect(classifyGeminiError(403, "API_KEY_INVALID")).toBe("invalid_key");
    expect(classifyGeminiError(402, "insufficient balance")).toBe("payment_required");
    expect(classifyGeminiError(503, "overloaded")).toBe("overloaded");
    expect(classifyGeminiError(400, "bad prompt")).toBe("upstream");
  });

  it("retries only transient/model-scoped codes, never auth or payment failures", () => {
    expect(isRetryableCode("rate_limited")).toBe(true);
    expect(isRetryableCode("quota_exhausted")).toBe(true);
    expect(isRetryableCode("model_unavailable")).toBe(true);
    expect(isRetryableCode("invalid_key")).toBe(false);
    expect(isRetryableCode("payment_required")).toBe(false);
    expect(isRetryableCode("upstream")).toBe(false);
  });

  it("never echoes raw provider bodies or keys in user-facing messages", () => {
    const leak = "key=AIzaSyExampleKey_0123456789abcdef -> upstream stacktrace";
    const code = classifyGeminiError(500, leak);
    const msg = aiErrorMessage(code);
    expect(msg).not.toContain("AIzaSy");
    expect(msg).not.toContain("stacktrace");
    expect(msg.length).toBeGreaterThan(10);
  });
});

describe("deterministic internal links", () => {
  const targets = [
    { kind: "game" as const, slug: "snow-road", title: "Snow Road", keyword: "snow road game" },
    { kind: "post" as const, slug: "cooking-pasta", title: "Cooking pasta at home", keyword: "pasta recipe" },
    { kind: "post" as const, slug: "snow-rider-tips", title: "Snow Rider tips", keyword: "snow rider tips" },
  ];

  it("ranks only real pages that overlap the seed words", () => {
    const links = rankInternalLinks("how to play snow rider without crashing", targets, 3);
    expect(links.map((l) => l.slug)).toEqual(["snow-rider-tips", "snow-road"]);
    expect(links.some((l) => l.slug === "cooking-pasta")).toBe(false);
  });

  it("returns nothing when there is no overlap (never invents links)", () => {
    expect(rankInternalLinks("quantum computing basics", targets, 3)).toEqual([]);
  });

  it("renders allowlisted internal URLs as followable anchors", () => {
    const html = relatedLinksHtml([targets[0]]);
    expect(html).toContain('<a href="/games/snow-road">Snow Road</a>');
    expect(html).not.toContain("nofollow");
    expect(internalPath({ kind: "post", slug: "x-y", title: "X" })).toBe("/blog/x-y");
    expect(internalPath({ kind: "landing", slug: "snow-rider-unblocked", title: "Snow Rider Unblocked" })).toBe("/snow-rider-unblocked");
  });

  it("drops targets with unsafe slugs", () => {
    expect(relatedLinksHtml([{ kind: "post", slug: "../evil", title: "Evil" }])).toBe("");
  });
});
