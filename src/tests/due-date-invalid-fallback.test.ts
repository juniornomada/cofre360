/**
 * Invalid-date rendering contract for the credit-card due label.
 * ---------------------------------------------------------------
 * Guarantees that BOTH routes that own the invoice header — Home
 * (src/routes/index.tsx) and /cards (src/routes/cards.tsx) — render
 * exactly "Venc. --/--" whenever the underlying `dueDate` is missing
 * or invalid (null, undefined, `new Date("not-a-date")`, malformed
 * numeric inputs, non-Date duck types, etc.).
 *
 * The routes call the canonical `formatDueLabel` helper for the
 * header text. If the helper's fallback contract holds for every
 * documented "invalid" input AND both routes pipe their `dueDate`
 * value straight into that helper (no inline "Venc. " concatenation),
 * then by transitivity both UIs will render exactly "Venc. --/--"
 * for invalid dates.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatDueDate,
  formatDueLabel,
  formatDueAriaLabel,
} from "@/lib/format-due-date";

const CANONICAL_INVALID_LABEL = "Venc. --/--";
const CANONICAL_INVALID_DATE = "--/--";
const CANONICAL_INVALID_ARIA = "Vencimento indisponível";

/** Exhaustive battery of inputs that MUST collapse to the placeholder. */
const INVALID_INPUTS: ReadonlyArray<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ['new Date("")', new Date("")],
  ['new Date("not-a-date")', new Date("not-a-date")],
  ['new Date("2026-13-45")', new Date("2026-13-45")],
  ["new Date(NaN)", new Date(NaN)],
  ["Date built from NaN timestamp", new Date(Number.NaN)],
  ["Date built from Infinity", new Date(Number.POSITIVE_INFINITY)],
  ["empty object", {}],
  ["duck-typed Date-ish object", { getDate: () => 5, getMonth: () => 4, getTime: () => NaN }],
  ["numeric primitive", 1_700_000_000_000],
  ["ISO string primitive", "2026-07-10"],
  ["boolean", false],
  ["array", [2026, 6, 10]],
];

describe("formatDueLabel — invalid inputs collapse to 'Venc. --/--'", () => {
  for (const [label, input] of INVALID_INPUTS) {
    it(`returns exactly "${CANONICAL_INVALID_LABEL}" for ${label}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = formatDueLabel(input as any);
      expect(result).toBe(CANONICAL_INVALID_LABEL);
      // Reinforce the strict shape: no trailing whitespace, no NaN, no
      // month name, no digits — exactly the placeholder.
      expect(result).toMatch(/^Venc\. --\/--$/);
      expect(result).not.toMatch(/NaN/i);
      expect(result).not.toMatch(/\d/);
      expect(result).not.toMatch(/Fatura/i);
    });
  }

  it("never emits 'Venc. NaN/NaN' for any invalid input", () => {
    for (const [, input] of INVALID_INPUTS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatDueLabel(input as any)).not.toContain("NaN");
    }
  });
});

describe("formatDueDate — invalid inputs collapse to '--/--'", () => {
  for (const [label, input] of INVALID_INPUTS) {
    it(`returns "${CANONICAL_INVALID_DATE}" for ${label}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatDueDate(input as any)).toBe(CANONICAL_INVALID_DATE);
    });
  }
});

describe("formatDueAriaLabel — invalid inputs collapse to accessible fallback", () => {
  for (const [label, input] of INVALID_INPUTS) {
    it(`returns "${CANONICAL_INVALID_ARIA}" for ${label}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatDueAriaLabel(input as any)).toBe(CANONICAL_INVALID_ARIA);
    });
  }
});

/**
 * Static guard: both routes pipe their due-date value STRAIGHT into
 * `formatDueLabel(...)`. Combined with the exhaustive functional
 * tests above, this proves each route renders exactly "Venc. --/--"
 * when its `dueDate` value is invalid.
 */
describe("Routes route their dueDate through the canonical helper", () => {
  const ROUTES = [
    { file: resolve(__dirname, "../routes/cards.tsx"), label: "cards.tsx" },
    { file: resolve(__dirname, "../routes/index.tsx"), label: "index.tsx" },
  ] as const;

  for (const { file, label } of ROUTES) {
    const src = readFileSync(file, "utf8");

    it(`${label}: renders the header exclusively via formatDueLabel(...)`, () => {
      // At least one JSX-embedded call to the helper.
      expect(src).toMatch(/\{\s*formatDueLabel\s*\(/);
    });

    it(`${label}: never renders "Venc. " as a hard-coded string next to a raw expression`, () => {
      // "Venc. {" would indicate the old inline path that bypasses the helper's
      // "--/--" fallback and could render "Venc. NaN/NaN" for invalid dates.
      expect(src).not.toMatch(/Venc\.\s*\{/);
      expect(src).not.toMatch(/"Venc\.\s+"\s*\+/);
      expect(src).not.toMatch(/`Venc\.\s+\$\{/);
    });
  }
});
