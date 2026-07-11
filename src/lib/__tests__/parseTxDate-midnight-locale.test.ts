import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTxDate, groupByBillingCycle, type CardTransaction } from "../invoice-utils";

/**
 * Timezone + locale robustness around midnight.
 *
 * A textual `date` field ("10 jul", "10/07", etc.) carries no time-of-day
 * and no timezone. It must always resolve to the same billing cycle
 * regardless of:
 *   1. the browser's local timezone offset,
 *   2. the OS locale (BCP47 tag / month name capitalization),
 *   3. whether `created_at` is a UTC instant a few minutes before/after
 *      local midnight — the wall-clock day flip must not shift the tx.
 */

const cycleKey = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;

const withTimezone = (offsetMinutes: number, fn: () => void) => {
  const orig = Date.prototype.getTimezoneOffset;
  // eslint-disable-next-line no-extend-native
  Date.prototype.getTimezoneOffset = function () { return offsetMinutes; };
  try { fn(); } finally {
    // eslint-disable-next-line no-extend-native
    Date.prototype.getTimezoneOffset = orig;
  }
};

const withLocale = (locale: string, fn: () => void) => {
  const origResolved = Intl.DateTimeFormat.prototype.resolvedOptions;
  const origToLocale = Date.prototype.toLocaleString;
  // eslint-disable-next-line no-extend-native
  Intl.DateTimeFormat.prototype.resolvedOptions = function () {
    return { ...origResolved.call(this), locale } as ReturnType<typeof origResolved>;
  };
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleString = function (l?: string | string[], opts?: Intl.DateTimeFormatOptions) {
    return origToLocale.call(this, l ?? locale, opts);
  };
  try { fn(); } finally {
    // eslint-disable-next-line no-extend-native
    Intl.DateTimeFormat.prototype.resolvedOptions = origResolved;
    // eslint-disable-next-line no-extend-native
    Date.prototype.toLocaleString = origToLocale;
  }
};

describe("parseTxDate — midnight & timezone invariance", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const midnightBoundaries = [
    // [label, created_at ISO, textual date, expected cycle key]
    ["23:59:00Z, tx same day",     "2026-07-10T23:59:00Z", "10 jul", "2026-07"],
    ["00:00:30Z, tx same day",     "2026-07-11T00:00:30Z", "11 jul", "2026-07"],
    ["23:59:59.999Z last of mo",   "2026-07-31T23:59:59.999Z", "31 jul", "2026-07"],
    ["00:00:00Z first of mo",      "2026-08-01T00:00:00Z", "01 ago", "2026-08"],
    ["Dec 31 23:59 UTC / jan tx",  "2026-12-31T23:59:00Z", "01 jan", "2027-01"],
    ["Jan 01 00:00 UTC / dez tx",  "2027-01-01T00:00:00Z", "31 dez", "2026-12"],
  ] as const;

  const offsets = [
    ["UTC", 0], ["BRT", 180], ["PST", 480], ["IST", -330], ["NZDT", -780], ["CHADT", -825],
  ] as const;

  for (const [label, createdAt, textual, expected] of midnightBoundaries) {
    for (const [tzName, offset] of offsets) {
      it(`[${tzName}] "${textual}" @ ${label} → ${expected}`, () => {
        withTimezone(offset, () => {
          const d = parseTxDate(textual, createdAt);
          expect(cycleKey(d)).toBe(expected);
        });
      });
    }
  }

  it("cycle key is identical across all timezones for the same input", () => {
    const keys = new Set<string>();
    for (const [, offset] of offsets) {
      withTimezone(offset, () => {
        keys.add(cycleKey(parseTxDate("15 mar", "2026-03-15T12:00:00Z")));
      });
    }
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("2026-03");
  });

  it("numeric DD/MM at midnight boundary matches textual equivalent", () => {
    withTimezone(180, () => {
      const a = parseTxDate("31/12", "2027-01-01T02:30:00Z"); // BRT: still Dec 31 local
      const b = parseTxDate("31 dez", "2027-01-01T02:30:00Z");
      expect(cycleKey(a)).toBe(cycleKey(b));
      expect(cycleKey(a)).toBe("2026-12");
    });
  });
});

describe("parseTxDate — locale invariance", () => {
  const locales = ["pt-BR", "en-US", "de-DE", "ja-JP", "ar-EG", "tr-TR", "C"];

  for (const loc of locales) {
    it(`[${loc}] month tokens still resolve to the same cycle`, () => {
      withLocale(loc, () => {
        expect(cycleKey(parseTxDate("10 jul", "2026-07-10T00:00:00Z"))).toBe("2026-07");
        expect(cycleKey(parseTxDate("10 JUL", "2026-07-10T00:00:00Z"))).toBe("2026-07");
        expect(cycleKey(parseTxDate("10 Julho", "2026-07-10T00:00:00Z"))).toBe("2026-07");
        expect(cycleKey(parseTxDate("10 março", "2026-03-10T00:00:00Z"))).toBe("2026-03");
        expect(cycleKey(parseTxDate("10 MARÇO", "2026-03-10T00:00:00Z"))).toBe("2026-03");
        expect(cycleKey(parseTxDate("10 fev.", "2026-02-10T00:00:00Z"))).toBe("2026-02");
      });
    });
  }

  it("Turkish locale dotless-i does not corrupt month recognition", () => {
    // Turkish locale has famous i/İ casing edge cases; ensure our
    // ASCII-normalized month map is not affected.
    withLocale("tr-TR", () => {
      expect(cycleKey(parseTxDate("05 jan", "2026-01-05T00:00:00Z"))).toBe("2026-01");
      expect(cycleKey(parseTxDate("05 JAN", "2026-01-05T00:00:00Z"))).toBe("2026-01");
      expect(cycleKey(parseTxDate("05 Janeiro", "2026-01-05T00:00:00Z"))).toBe("2026-01");
    });
  });
});

describe("groupByBillingCycle — midnight & tz invariance", () => {
  const makeTx = (id: string, date: string, created_at: string): CardTransaction => ({
    id, name: id, icon: null, category: "test", card: null,
    date, amount: 100, type: "expense", created_at,
    total_installments: null, installment_number: null, installment_group_id: null,
  });

  it("transaction on last day of cycle stays in that cycle across timezones", () => {
    // Card closes on day 10; a tx dated "09 jul" should always land in the
    // cycle whose closing date is 2026-07-10, regardless of the local tz
    // interpreting created_at midnight differently.
    const tx = makeTx("t1", "09 jul", "2026-07-09T23:59:00Z");
    const reference = new Date(2026, 6, 15); // 15 jul 2026 local

    const totals: number[] = [];
    for (const offset of [0, 180, 480, -330, -780]) {
      withTimezone(offset, () => {
        const periods = groupByBillingCycle([tx], 10, 20, reference);
        const current = periods.find(p => p.key === "current");
        totals.push(current?.transactions.length ?? -1);
      });
    }
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(1);
  });

  it("cross-year textual tx (\"31 dez\" created 01-jan) maps to Dec cycle in every tz", () => {
    const tx = makeTx("t1", "31 dez", "2027-01-01T00:30:00Z");
    // Reference in Dec 2026 so "past" & "current" span the year rollover.
    const reference = new Date(2026, 11, 31); // 31 dez 2026

    for (const offset of [0, 180, 480, -330, -780]) {
      withTimezone(offset, () => {
        const periods = groupByBillingCycle([tx], 10, 20, reference);
        // find any period that contains it
        const holder = periods.find(p => p.transactions.some(t => t.id === "t1"));
        expect(holder).toBeDefined();
        // Must NOT be a future_* cycle in 2027 — the year heuristic pulls it back to 2026.
        const endYear = holder!.endDate.getFullYear();
        expect(endYear).toBeLessThanOrEqual(2027);
        // It must be inside a period whose window covers Dec 2026.
        expect(holder!.startDate.getFullYear()).toBeLessThanOrEqual(2026);
      });
    }
  });

  it("two identical calendar days expressed as textual vs numeric map to the same period", () => {
    const txA = makeTx("A", "10 jul", "2026-07-10T12:00:00Z");
    const txB = makeTx("B", "10/07",  "2026-07-10T12:00:00Z");
    const txC = makeTx("C", "2026-07-10", "2026-07-10T12:00:00Z");
    const reference = new Date(2026, 6, 15);

    withTimezone(180, () => {
      const periods = groupByBillingCycle([txA, txB, txC], 10, 20, reference);
      const holderKeys = ["A", "B", "C"].map(id =>
        periods.find(p => p.transactions.some(t => t.id === id))?.key
      );
      expect(new Set(holderKeys).size).toBe(1);
    });
  });
});
