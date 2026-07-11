import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseTxDate,
  groupByBillingCycle,
  getCycleDates,
  type CardTransaction,
} from "../invoice-utils";

/**
 * Timezone / clock stability for parseTxDate + cycle-key derivation.
 *
 * The sandbox always runs in UTC. To prove behaviour is stable across
 * time zones we do two orthogonal things:
 *
 *   1. Freeze the wall clock with vi.useFakeTimers()/vi.setSystemTime() so
 *      the "now" fallback and the reference date used by getCycleDates()
 *      are deterministic across runs.
 *
 *   2. Vary the offset suffix on `created_at` ISO strings (Z, +00:00,
 *      +05:30, -03:00, -08:00, +14:00) for the SAME absolute instant, and
 *      assert that parseTxDate and the derived cycle key are identical.
 *      Any regression that slices `created_at` as a string (e.g. taking
 *      the first 4 chars for the year) would produce different results
 *      per offset — this test locks that out.
 *
 *   3. Additionally, we mock Date.prototype.getTimezoneOffset to simulate
 *      running under non-UTC hosts. parseTxDate's textual/numeric paths
 *      construct dates via `new Date(y, m, d)` which is local-time, but
 *      the cycle boundaries are also local-time, so the two must always
 *      agree on classification regardless of the emulated offset.
 */

const CLOSING = 10;
const DUE = 20;

let seq = 0;
function tx(dateText: string, createdAt: string): CardTransaction {
  return {
    id: `t${++seq}`, name: `Tx ${seq}`, icon: null, category: "food", card: "Card",
    date: dateText, amount: 100, type: "expense", created_at: createdAt,
    total_installments: null, installment_number: null, installment_group_id: null,
  };
}

/** All ISO representations of the exact same absolute instant. */
const SAME_INSTANT_ISOS = [
  "2026-07-10T12:00:00Z",
  "2026-07-10T12:00:00.000Z",
  "2026-07-10T12:00:00+00:00",
  "2026-07-10T17:30:00+05:30", // India
  "2026-07-10T09:00:00-03:00", // BRT
  "2026-07-10T04:00:00-08:00", // PST
  "2026-07-11T02:00:00+14:00", // Kiribati
];

describe("parseTxDate — same absolute instant, different offset suffixes → identical parse", () => {
  it.each(SAME_INSTANT_ISOS)(
    "ISO textual date parses identically regardless of offset suffix on the string (%s)",
    (iso) => {
      const d = parseTxDate(iso, "2026-01-01T00:00:00Z");
      const ref = new Date("2026-07-10T12:00:00Z");
      // Absolute instant must be the same.
      expect(d.getTime()).toBe(ref.getTime());
    },
  );

  it("textual '10 jul' + created_at at the same instant in any offset → same Date object", () => {
    const results = SAME_INSTANT_ISOS.map((iso) => parseTxDate("10 jul", iso).getTime());
    expect(new Set(results).size).toBe(1);
  });

  it("numeric '10/07' + created_at at the same instant in any offset → same Date object", () => {
    const results = SAME_INSTANT_ISOS.map((iso) => parseTxDate("10/07", iso).getTime());
    expect(new Set(results).size).toBe(1);
  });

  it("textual '10 jul' anchored via any offset variant lands on 10 Jul 2026 local", () => {
    for (const iso of SAME_INSTANT_ISOS) {
      const d = parseTxDate("10 jul", iso);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(6);
      expect(d.getDate()).toBe(10);
    }
  });
});

describe("cycle key — offset suffix on created_at never affects classification", () => {
  const reference = new Date(2026, 6, 15); // 15 Jul 2026

  it("same textual date + created_at expressed in 7 different offsets → same cycle key", () => {
    const txs = SAME_INSTANT_ISOS.map((iso) => tx("09 jul", iso));
    const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);
    const keys = new Set<string>();
    for (const p of periods) for (const t of p.transactions) keys.add(p.key);
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("current");
  });

  it("empty date field + created_at in any offset suffix → same cycle key", () => {
    const txs = SAME_INSTANT_ISOS.map((iso) => tx("", iso));
    const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);
    const keys = new Set<string>();
    for (const p of periods) for (const t of p.transactions) keys.add(p.key);
    expect(keys.size).toBe(1);
  });
});

describe("frozen clock — 'now' fallback is deterministic across runs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin wall clock to 15 Jul 2026 12:00 UTC.
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parseTxDate falls back to the FROZEN 'now', not the real wall clock", () => {
    // Malformed created_at forces the "now" fallback for a token-only date.
    // "10 jul" with no year → uses fallback year = 2026 (frozen).
    const d = parseTxDate("10 jul", "not-a-date");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(10);
  });

  it("completely empty inputs return the frozen 'now'", () => {
    const d = parseTxDate("", "");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
  });

  it("getCycleDates against 'new Date()' uses the frozen clock", () => {
    const { currentClose } = getCycleDates(new Date(), CLOSING, DUE);
    expect(currentClose.getFullYear()).toBe(2026);
    expect(currentClose.getMonth()).toBe(6);
    expect(currentClose.getDate()).toBe(CLOSING);
  });

  it("frozen year rollover: 'now' fallback for '02 jan' at 31-Dec-2026 23:59 → Jan 2027 (heuristic)", () => {
    vi.setSystemTime(new Date("2026-12-31T23:59:00Z"));
    const d = parseTxDate("02 jan", "still-not-a-date");
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(2);
  });

  it("frozen mid-January: 'now' fallback for '31 dez' → Dec 2026 (symmetric heuristic)", () => {
    vi.setSystemTime(new Date("2027-01-05T10:00:00Z"));
    const d = parseTxDate("31 dez", "");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });
});

describe("mocked getTimezoneOffset — cycle classification stays self-consistent", () => {
  const offsets = [
    { label: "UTC",       minutes: 0 },
    { label: "BRT -03",   minutes: 180 },   // Brazil
    { label: "IST +05:30", minutes: -330 }, // India
    { label: "PST -08",   minutes: 480 },
    { label: "NZDT +13",  minutes: -780 },
  ];

  let tzSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
  });
  afterEach(() => {
    tzSpy?.mockRestore();
    tzSpy = undefined;
    vi.useRealTimers();
  });

  it.each(offsets)(
    "under emulated host TZ %s: '09 jul' + created_at 09-Jul-2026 → cycle 'current'",
    ({ minutes }) => {
      tzSpy = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(minutes);
      const reference = new Date(2026, 6, 15);
      const periods = groupByBillingCycle(
        [tx("09 jul", "2026-07-09T12:00:00Z")],
        CLOSING, DUE, reference,
      );
      const found = periods.find((p) => p.transactions.length > 0);
      expect(found).toBeDefined();
      expect(found!.key).toBe("current");
    },
  );

  it.each(offsets)(
    "under emulated host TZ %s: cycle boundaries and parseTxDate agree (self-consistency)",
    ({ minutes }) => {
      tzSpy = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(minutes);
      // A tx exactly on the closing day → the parser must place it OUT of
      // the "current" cycle (which is [prevClose, currentClose) — exclusive).
      const reference = new Date(2026, 6, 15);
      const { currentClose, prevClose } = getCycleDates(reference, CLOSING, DUE);

      const onClose = parseTxDate("10 jul", "2026-07-10T00:00:00Z");
      // 10 Jul equals currentClose day, so it belongs to future_0 (not current).
      expect(onClose >= currentClose).toBe(true);

      const dayBeforeClose = parseTxDate("09 jul", "2026-07-09T23:00:00Z");
      expect(dayBeforeClose >= prevClose && dayBeforeClose < currentClose).toBe(true);
    },
  );

  it("emulated timezones do NOT scatter the same tx across different cycle keys", () => {
    const reference = new Date(2026, 6, 15);
    const observed = new Set<string>();
    for (const { minutes } of offsets) {
      tzSpy?.mockRestore();
      tzSpy = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(minutes);
      const periods = groupByBillingCycle(
        [tx("15 jun", "2026-06-15T12:00:00Z")],
        CLOSING, DUE, reference,
      );
      const key = periods.find((p) => p.transactions.length > 0)?.key ?? "none";
      observed.add(key);
    }
    expect(observed.size).toBe(1);
    expect([...observed][0]).toBe("current"); // 15 Jun 2026 is in [10 Jun, 10 Jul)
  });
});

describe("cycle key stability under a swept wall clock", () => {
  afterEach(() => vi.useRealTimers());

  it("stepping the clock hour-by-hour across the Dec→Jan rollover does not misclassify", () => {
    vi.useFakeTimers();
    // Step every 3 hours from 30 Dec 2026 00:00Z to 03 Jan 2027 00:00Z.
    const start = new Date("2026-12-30T00:00:00Z").getTime();
    const end = new Date("2027-01-03T00:00:00Z").getTime();
    for (let t = start; t <= end; t += 3 * 3600 * 1000) {
      vi.setSystemTime(new Date(t));
      // A tx dated "28 dez" whose row was inserted at 28 Dec 2026 12:00Z
      // must ALWAYS resolve to 28 Dec 2026, regardless of the current wall clock.
      const parsed = parseTxDate("28 dez", "2026-12-28T12:00:00Z");
      expect(parsed.getFullYear(), `wall=${new Date(t).toISOString()}`).toBe(2026);
      expect(parsed.getMonth()).toBe(11);
      expect(parsed.getDate()).toBe(28);
    }
  });
});
