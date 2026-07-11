import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate } from "../invoice-utils";

/**
 * Contract: parseTxDate must NEVER return an invalid Date. When both the
 * primary source (`dateStr`) and the fallback (`created_at`) are missing,
 * empty, or unparseable, the function must fall through to `new Date()`
 * (the current wall clock) and return a Date whose `.getTime()` is a
 * finite number.
 *
 * This is a defensive contract test: downstream code (billing cycles,
 * grouping, sorting, aggregation) all rely on comparing timestamps.
 * A single NaN slipping through would break every ordering assumption
 * and silently place transactions in "no cycle" instead of surfacing
 * the bad input.
 */

const CASES: Array<[label: string, dateStr: string, createdAt: string]> = [
  ["both empty",                                "",                      ""],
  ["both whitespace",                           "   ",                   "   "],
  ["both tab/newline",                          "\t\n",                  "\n\t "],
  ["date empty, created_at NaN string",         "",                      "not-a-date"],
  ["date empty, created_at 'null'",             "",                      "null"],
  ["date empty, created_at 'undefined'",        "",                      "undefined"],
  ["date empty, created_at random garbage",     "",                      "%%%///???"],
  ["date empty, created_at empty ISO",          "",                      "T::"],
  ["date NaN string, created_at empty",         "not-a-date",            ""],
  ["date NaN string, created_at NaN string",    "banana",                "abacaxi"],
  ["date '32/13' (invalid dmy), created_at ''", "32/13",                 ""],
  ["date '99/99', created_at 'lixo'",           "99/99",                 "lixo"],
  ["date 'DD monthlike-noise', created_at ''",  "07 janela",             ""],  // "janela" not a month
  ["date 'DD marte' (planet), created_at ''",   "07 marte",              ""],
  ["date '00/00/0000', created_at 'bad'",       "00/00/0000",            "bad"],
  ["date '/', created_at '-'",                  "/",                     "-"],
  ["date single dash, created_at whitespace",   "-",                     " "],
  ["date single slash, created_at newline",     "/",                     "\n"],
  ["date empty, created_at 'Invalid Date'",     "",                      "Invalid Date"],
  ["both literally the string 'NaN'",           "NaN",                   "NaN"],
];

// null/undefined can't be typed through the CardTransaction path, but the
// runtime is loose enough that Home/Cards routes have historically passed
// non-string values here. Cast at the call site to lock the contract.
const NULL_ISH_CASES: Array<[label: string, dateStr: unknown, createdAt: unknown]> = [
  ["both null",                     null,      null],
  ["both undefined",                undefined, undefined],
  ["date null, created_at string",  null,      "still-bad"],
  ["date undefined, created_at ''", undefined, ""],
  ["date '', created_at null",      "",        null],
  ["date '', created_at undefined", "",        undefined],
  ["date null, created_at number",  null,      12345 as unknown],
  ["date {}, created_at []",        {} as unknown, [] as unknown],
];

describe("parseTxDate — fallback to new Date() never returns NaN", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze the wall clock so the "now" fallback is deterministic.
    vi.setSystemTime(new Date("2026-07-15T12:34:56Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(CASES)("%s → finite Date, never NaN", (_label, dateStr, createdAt) => {
    const d = parseTxDate(dateStr, createdAt);
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(Number.isFinite(d.getTime())).toBe(true);
  });

  it.each(CASES)("%s → falls back to the FROZEN 'now'", (_label, dateStr, createdAt) => {
    const d = parseTxDate(dateStr, createdAt);
    // If neither dateStr nor created_at is a valid date/token, both must
    // route to `new Date()`, which the fake timer pins to 15-Jul-2026 12:34:56Z.
    // We allow textual dates that DO have a valid month token (e.g. never
    // included in CASES) to override, but nothing in CASES qualifies.
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(15);
  });

  it.each(NULL_ISH_CASES)("null/undefined input: %s → finite Date, never NaN", (_label, dateStr, createdAt) => {
    // Cast through unknown because runtime callers can pass non-strings.
    const d = parseTxDate(dateStr as string, createdAt as string);
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(Number.isFinite(d.getTime())).toBe(true);
  });

  it("comparing two fallback results yields a defined ordering (both are numbers)", () => {
    const a = parseTxDate("", "");
    const b = parseTxDate("garbage", "also-garbage");
    // Both must be finite numbers so `<`, `>`, `>=` return booleans (not NaN),
    // which is what groupByBillingCycle relies on when placing transactions.
    expect(typeof (a >= b)).toBe("boolean");
    expect(typeof (a < b)).toBe("boolean");
    expect(a.getTime() - b.getTime()).not.toBeNaN();
  });

  it("sorting an array of fully-invalid entries succeeds without producing NaN slots", () => {
    const dates = CASES.map(([, s, c]) => parseTxDate(s, c));
    // Sorting requires the comparator to return numbers; NaN would break it.
    const sorted = [...dates].sort((x, y) => x.getTime() - y.getTime());
    expect(sorted.length).toBe(dates.length);
    for (const d of sorted) {
      expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });

  it("fallback Date advances when the frozen clock advances (proves it uses 'now', not a cached constant)", () => {
    const first = parseTxDate("", "");
    vi.setSystemTime(new Date("2027-03-20T00:00:00Z"));
    const second = parseTxDate("", "");
    expect(first.getTime()).not.toBe(second.getTime());
    expect(second.getUTCFullYear()).toBe(2027);
    expect(second.getUTCMonth()).toBe(2);
    expect(second.getUTCDate()).toBe(20);
  });
});

describe("parseTxDate — partial validity: one source good, the other bad", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("valid date + invalid created_at → uses date, not now", () => {
    // "10 jul" is a valid textual token; the invalid created_at forces
    // the parser to reach for the frozen fallback year (2026).
    const d = parseTxDate("10 jul", "garbage");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(10);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it("invalid date + valid created_at → uses created_at exactly", () => {
    const d = parseTxDate("garbage-input", "2025-03-12T09:00:00Z");
    expect(d.toISOString()).toBe("2025-03-12T09:00:00.000Z");
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it("invalid date + invalid created_at → now (frozen), never NaN", () => {
    const d = parseTxDate("garbage-input", "also-garbage");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(15);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});
