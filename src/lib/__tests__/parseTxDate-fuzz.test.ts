import { describe, it, expect } from "vitest";
import { parseTxDate } from "../invoice-utils";

const CREATED_AT = "2026-07-15T12:00:00Z";

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xc0ffee);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const WS = [" ", "  ", "\t", " \t ", "\n", " \n "];
const PUNCT = ["", ".", ",", ";", ":", "!", "?", "-"];
const ACCENT_VARIANTS: Record<string, string[]> = {
  jan: ["jan", "Jan", "JAN", "janeiro", "Janeiro", "JANEIRO"],
  fev: ["fev", "Fev", "FEV", "fevereiro", "Fevereiro", "fev."],
  mar: ["mar", "Mar", "março", "Março", "MARÇO", "marco", "MARCO"],
  abr: ["abr", "Abr", "ABR", "abril", "Abril"],
  mai: ["mai", "Mai", "maio", "Maio"],
  jun: ["jun", "Jun", "JUN", "junho", "Junho"],
  jul: ["jul", "Jul", "JUL", "julho", "Julho", "JULHO"],
  ago: ["ago", "Ago", "AGO", "agosto", "Agosto"],
  set: ["set", "Set", "SET", "setembro", "Setembro"],
  out: ["out", "Out", "OUT", "outubro", "Outubro"],
  nov: ["nov", "Nov", "NOV", "novembro", "Novembro"],
  dez: ["dez", "Dez", "DEZ", "dezembro", "Dezembro"],
};

const MONTH_TO_IDX: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function fuzzTextual(day: number, monthKey: keyof typeof ACCENT_VARIANTS): string {
  const dayStr = rand() < 0.5 && day < 10 ? `0${day}` : `${day}`;
  const monthTok = pick(ACCENT_VARIANTS[monthKey]);
  const sep = pick(WS);
  const tail = pick(PUNCT);
  const lead = rand() < 0.3 ? pick(WS) : "";
  return `${lead}${dayStr}${sep}${monthTok}${tail}`;
}

function cycleKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

describe("parseTxDate — fuzz (spaces, casing, punctuation)", () => {
  it("500 random variants per month collapse to the expected cycle key", () => {
    const months = Object.keys(ACCENT_VARIANTS) as (keyof typeof ACCENT_VARIANTS)[];
    const failures: Array<{ input: string; got: string; want: string }> = [];

    for (const monthKey of months) {
      const monthIdx = MONTH_TO_IDX[monthKey];
      // Choose an unambiguous fallback year (avoid Dec↔Jan boundary shift).
      const day = 1 + Math.floor(rand() * 28);
      const expected = `2026-${monthIdx}-${day}`;

      for (let i = 0; i < 500; i++) {
        const input = fuzzTextual(day, monthKey);
        const got = cycleKey(parseTxDate(input, CREATED_AT));
        if (got !== expected) {
          failures.push({ input: JSON.stringify(input), got, want: expected });
        }
      }
    }

    if (failures.length) {
      // eslint-disable-next-line no-console
      console.error("first 10 fuzz failures:", failures.slice(0, 10));
    }
    expect(failures).toEqual([]);
  });

  it("all-uppercase / all-lowercase / mixed-case variants agree", () => {
    for (const monthKey of Object.keys(ACCENT_VARIANTS) as (keyof typeof ACCENT_VARIANTS)[]) {
      const base = `12 ${monthKey}`;
      const keys = new Set(
        [
          base,
          base.toUpperCase(),
          base.replace(monthKey, monthKey[0].toUpperCase() + monthKey.slice(1)),
          `  12   ${monthKey.toUpperCase()}.  `,
          `12\t${monthKey}`,
          `12\n${monthKey}`,
        ].map((s) => cycleKey(parseTxDate(s, CREATED_AT))),
      );
      expect(keys.size).toBe(1);
    }
  });

  it("random punctuation trailing the month token does not shift the cycle", () => {
    for (let i = 0; i < 200; i++) {
      const monthKey = pick(Object.keys(ACCENT_VARIANTS)) as keyof typeof ACCENT_VARIANTS;
      const monthIdx = MONTH_TO_IDX[monthKey];
      const day = 1 + Math.floor(rand() * 28);
      const punct = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(PUNCT)).join("");
      const input = `${day} ${pick(ACCENT_VARIANTS[monthKey])}${punct}`;
      const got = cycleKey(parseTxDate(input, CREATED_AT));
      expect(got).toBe(`2026-${monthIdx}-${day}`);
    }
  });
});
