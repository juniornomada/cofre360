import { describe, it, expect } from "vitest";
import { parseTxDate } from "../invoice-utils";

/**
 * Fuzz suite for parseTxDate against noisy textual `date` strings.
 *
 * The parser must be resilient to:
 *   - extra pontuação  ("10, jul.", "10; jul!")
 *   - line breaks / tabs / carriage returns
 *   - invisible / zero-width unicode (U+200B, U+FEFF, U+00A0, U+2028, etc.)
 *   - random capitalization
 *
 * Invariants:
 *   1. `created_at` is never mutated by the parser (string identity holds).
 *   2. The resolved cycle key (YYYY-MM) matches the clean canonical form.
 *   3. The parser never returns NaN.
 */

const CANON = [
  { txt: "10 jul", created_at: "2026-07-10T12:00:00Z", cycle: "2026-07" },
  { txt: "01 jan", created_at: "2026-12-31T23:59:00Z", cycle: "2027-01" }, // year-rollover
  { txt: "31 dez", created_at: "2027-01-02T00:30:00Z", cycle: "2026-12" }, // year-rollover
  { txt: "15 março", created_at: "2026-03-15T09:00:00Z", cycle: "2026-03" },
  { txt: "05 fev", created_at: "2026-02-05T00:00:00Z", cycle: "2026-02" },
  { txt: "28 setembro", created_at: "2026-09-28T18:45:00Z", cycle: "2026-09" },
  { txt: "10/07", created_at: "2026-07-10T00:00:00Z", cycle: "2026-07" },
  { txt: "2026-07-10", created_at: "2026-07-10T00:00:00Z", cycle: "2026-07" },
];

// Invisible / zero-width / exotic whitespace codepoints.
const INVISIBLES = [
  "\u200B", // zero width space
  "\u200C", // zero width non-joiner
  "\u200D", // zero width joiner
  "\uFEFF", // BOM
  "\u00A0", // no-break space
  "\u2028", // line separator
  "\u2029", // paragraph separator
  "\u180E", // Mongolian vowel separator
  "\u202F", // narrow no-break space
  "\u205F", // medium mathematical space
];

const WHITESPACE = [" ", "  ", "\t", "\n", "\r", "\r\n", "\t\n "];
const PUNCT = ["", ".", ",", ";", ":", "!", "?", "...", ".,", " -"];

// Deterministic PRNG so failures reproduce.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];

function scrambleCase(rng: () => number, s: string): string {
  return [...s].map((ch) => (rng() < 0.5 ? ch.toUpperCase() : ch.toLowerCase())).join("");
}

function noisify(rng: () => number, canonical: string): string {
  // Split into whatever whitespace boundary the canonical uses.
  const tokens = canonical.split(/(\s+|[\/\-])/).filter((t) => t.length > 0);
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isSeparator = /^(\s+|[\/\-])$/.test(tok);
    if (isSeparator) {
      // Replace whitespace with a random mix of ws + invisibles.
      if (/\s/.test(tok)) {
        const n = 1 + Math.floor(rng() * 3);
        let sep = "";
        for (let k = 0; k < n; k++) sep += rng() < 0.5 ? pick(rng, WHITESPACE) : pick(rng, INVISIBLES);
        parts.push(sep);
      } else {
        parts.push(tok); // keep "/" or "-" untouched
      }
    } else {
      parts.push(scrambleCase(rng, tok) + pick(rng, PUNCT));
    }
  }
  // Optional leading/trailing garbage of invisibles + whitespace.
  const lead = rng() < 0.5 ? pick(rng, INVISIBLES) + pick(rng, WHITESPACE) : "";
  const trail = rng() < 0.5 ? pick(rng, WHITESPACE) + pick(rng, INVISIBLES) : "";
  return lead + parts.join("") + trail;
}

const cycleKey = (d: Date) =>
  `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;

describe("parseTxDate fuzz — noisy textual date", () => {
  const ITERATIONS_PER_CASE = 300;

  for (const { txt, created_at, cycle } of CANON) {
    it(`"${txt}" survives ${ITERATIONS_PER_CASE} noisy variants → cycle ${cycle}`, () => {
      const rng = mulberry32(0xC0FFEE ^ txt.length ^ cycle.charCodeAt(0));
      const failures: Array<{ variant: string; got: string }> = [];
      const preservedCreatedAt = created_at;

      for (let i = 0; i < ITERATIONS_PER_CASE; i++) {
        const variant = noisify(rng, txt);
        // Freeze a copy to prove the parser never mutates it.
        const createdAtSnapshot = preservedCreatedAt;

        const d = parseTxDate(variant, createdAtSnapshot);

        // Invariant 1: created_at reference is not mutated.
        expect(createdAtSnapshot).toBe(preservedCreatedAt);
        // Invariant 3: never NaN.
        expect(Number.isNaN(d.getTime())).toBe(false);
        // Invariant 2: cycle key matches canonical.
        const key = cycleKey(d);
        if (key !== cycle) failures.push({ variant: JSON.stringify(variant), got: key });
      }

      if (failures.length > 0) {
        // Show up to 5 offending variants for debuggability.
        const preview = failures.slice(0, 5).map((f) => `${f.variant} → ${f.got}`).join("\n  ");
        throw new Error(`${failures.length}/${ITERATIONS_PER_CASE} variants drifted:\n  ${preview}`);
      }
    });
  }

  it("does not mutate the passed created_at string (identity check across 1000 calls)", () => {
    const rng = mulberry32(42);
    const original = "2026-07-10T12:34:56.789Z";
    const frozen = original;
    for (let i = 0; i < 1000; i++) {
      const noisy = noisify(rng, "10 jul");
      parseTxDate(noisy, frozen);
      expect(frozen).toBe(original);
      expect(frozen.length).toBe(original.length);
    }
  });

  it("returns a valid Date even for pathological all-invisible strings", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      let s = "";
      const n = 1 + Math.floor(rng() * 10);
      for (let k = 0; k < n; k++) s += pick(rng, INVISIBLES);
      const d = parseTxDate(s, "2026-07-10T12:00:00Z");
      expect(Number.isNaN(d.getTime())).toBe(false);
      // Falls back to created_at (July 2026) — must not drift months.
      expect(cycleKey(d)).toBe("2026-07");
    }
  });

  it("garbage tokens with valid month word still resolve when day is parseable", () => {
    // "10\u200B jul.,;" — day is numeric, month is a known token after normalization.
    const cases = [
      "10\u200B jul",
      "10\uFEFF\tJUL.",
      "10\u00A0Julho,",
      "  10\r\nmarço!  ",
      "\u2028 05 \u2029 FEV ; ",
    ];
    const expected: Record<string, string> = {
      "10\u200B jul": "2026-07",
      "10\uFEFF\tJUL.": "2026-07",
      "10\u00A0Julho,": "2026-07",
      "  10\r\nmarço!  ": "2026-03",
      "\u2028 05 \u2029 FEV ; ": "2026-02",
    };
    for (const c of cases) {
      const created = `2026-${expected[c].split("-")[1]}-10T00:00:00Z`;
      const d = parseTxDate(c, created);
      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(cycleKey(d)).toBe(expected[c]);
    }
  });
});
