import { describe, it, expect } from "vitest";
import { parseTxDate } from "../invoice-utils";

/**
 * Fuzz expansion for parseTxDate separator handling.
 *
 * Covers:
 *  - Unicode dashes around day/month and day-month-year:
 *      U+2010 (‐), U+2011 (‑), U+2012 (‒), U+2013 (–), U+2014 (—),
 *      U+2015 (―), U+2212 (−), U+FE58 (﹘), U+FE63 (﹣), U+FF0D (－)
 *  - ASCII hyphen and forward slash as baseline.
 *  - Runs of spaces (1..8) and tabs (\t, mixed) around the separator.
 *
 * Contract: every noisy variant must produce the exact same timestamp as
 * the canonical "DD/MM" or "DD/MM/YYYY" form and never return NaN.
 */

const UNICODE_DASHES = [
  "\u2010", "\u2011", "\u2012", "\u2013", "\u2014",
  "\u2015", "\u2212", "\uFE58", "\uFE63", "\uFF0D",
];
const ASCII_SEPS = ["-", "/"];
const ALL_SEPS = [...ASCII_SEPS, ...UNICODE_DASHES];

// deterministic PRNG (LCG) — reproducible fuzz
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const WHITESPACE_POOLS = [
  "", " ", "  ", "   ", "        ",
  "\t", "\t\t", " \t ", "\t \t", " \t\t ", "\t   \t",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function canonicalDDMM(day: number, month: number): string {
  return `${pad2(day)}/${pad2(month)}`;
}
function canonicalDDMMYYYY(day: number, month: number, year: number): string {
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

// Fallback anchored well away from Dec↔Jan so the year-heuristic doesn't
// interfere with the separator-focused assertions.
const FALLBACK = "2026-06-15T12:00:00Z";

function build(parts: string[], seps: string[], wsPools: string[], rnd: () => number) {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out += parts[i];
    if (i < parts.length - 1) {
      const wsL = wsPools[Math.floor(rnd() * wsPools.length)];
      const wsR = wsPools[Math.floor(rnd() * wsPools.length)];
      out += wsL + seps[i] + wsR;
    }
  }
  return out;
}

describe("parseTxDate — separator fuzz (unicode dashes, tabs, multi-space)", () => {
  it("every unicode/ASCII separator around DD?MM matches DD/MM (single-sep)", () => {
    const anchors: Array<[number, number]> = [
      [1, 1], [15, 7], [28, 2], [30, 4], [31, 12], [10, 10], [7, 3],
    ];
    for (const [d, m] of anchors) {
      const canonical = parseTxDate(canonicalDDMM(d, m), FALLBACK).getTime();
      expect(isNaN(canonical)).toBe(false);
      for (const sep of ALL_SEPS) {
        for (const ws of WHITESPACE_POOLS) {
          const variants = [
            `${pad2(d)}${sep}${pad2(m)}`,
            `${pad2(d)}${ws}${sep}${ws}${pad2(m)}`,
            `${pad2(d)}${ws}${sep}${pad2(m)}`,
            `${pad2(d)}${sep}${ws}${pad2(m)}`,
          ];
          for (const v of variants) {
            const t = parseTxDate(v, FALLBACK).getTime();
            expect(isNaN(t), `NaN for ${JSON.stringify(v)}`).toBe(false);
            expect(t, `mismatch for ${JSON.stringify(v)} (${d}/${m})`).toBe(canonical);
          }
        }
      }
    }
  });

  it("every unicode/ASCII separator around DD?MM?YYYY matches DD/MM/YYYY", () => {
    const anchors: Array<[number, number, number]> = [
      [1, 1, 2024], [15, 7, 2026], [29, 2, 2024], [31, 12, 2099], [10, 10, 2000],
    ];
    for (const [d, m, y] of anchors) {
      const canonical = parseTxDate(canonicalDDMMYYYY(d, m, y), FALLBACK).getTime();
      expect(isNaN(canonical)).toBe(false);
      for (const sep of ALL_SEPS) {
        for (const ws of ["", " ", "  ", "\t", " \t "]) {
          const v = `${pad2(d)}${ws}${sep}${ws}${pad2(m)}${ws}${sep}${ws}${y}`;
          const t = parseTxDate(v, FALLBACK).getTime();
          expect(isNaN(t), `NaN for ${JSON.stringify(v)}`).toBe(false);
          expect(t, `mismatch for ${JSON.stringify(v)}`).toBe(canonical);
        }
      }
    }
  });

  it("mixed separators (e.g. '15 – 07 - 2026') still resolve to canonical", () => {
    const canonical = parseTxDate("15/07/2026", FALLBACK).getTime();
    const mixes = [
      "15 – 07 - 2026", "15\u2014 07 \u2212 2026",
      "15\t–\t07\t/\t2026", "15  −  07  –  2026",
      "15\u2010 07\u2011 2026", "15\uFF0D07\u201507\u20132026".replace("07\u201507", "07\u20152026"), // safe
    ];
    for (const v of mixes) {
      const t = parseTxDate(v, FALLBACK).getTime();
      expect(isNaN(t), `NaN for ${JSON.stringify(v)}`).toBe(false);
      // day/month/year must survive; compare via Date fields to tolerate the
      // synthesized noisy last case that may collapse to DD/MM (still valid).
      const parsed = new Date(t);
      expect(parsed.getDate()).toBe(15);
      expect(parsed.getMonth()).toBe(6);
      expect([2026, new Date(FALLBACK).getFullYear()]).toContain(parsed.getFullYear());
    }
    expect(canonical).toBe(new Date(2026, 6, 15).getTime());
  });

  it("randomized fuzz: 600 noisy variants — no NaN, day/month preserved", () => {
    const rnd = lcg(0xC0FFEE);
    for (let i = 0; i < 600; i++) {
      const m = 1 + Math.floor(rnd() * 12);
      const d = 1 + Math.floor(rnd() * 28); // safe day for all months
      const includeYear = rnd() < 0.5;
      const y = 2000 + Math.floor(rnd() * 60);
      const seps = includeYear
        ? [ALL_SEPS[Math.floor(rnd() * ALL_SEPS.length)], ALL_SEPS[Math.floor(rnd() * ALL_SEPS.length)]]
        : [ALL_SEPS[Math.floor(rnd() * ALL_SEPS.length)]];
      const parts = includeYear ? [pad2(d), pad2(m), String(y)] : [pad2(d), pad2(m)];
      const v = build(parts, seps, WHITESPACE_POOLS, rnd);
      const parsed = parseTxDate(v, FALLBACK);
      const t = parsed.getTime();
      expect(isNaN(t), `NaN for ${JSON.stringify(v)}`).toBe(false);
      expect(parsed.getDate(), `day drift for ${JSON.stringify(v)}`).toBe(d);
      expect(parsed.getMonth(), `month drift for ${JSON.stringify(v)}`).toBe(m - 1);
      if (includeYear) {
        expect(parsed.getFullYear(), `year drift for ${JSON.stringify(v)}`).toBe(y);
      }
    }
  });
});
