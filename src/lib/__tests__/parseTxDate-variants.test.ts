import { describe, it, expect } from "vitest";
import {
  parseTxDate,
  groupByBillingCycle,
  shortMonthMap,
  type CardTransaction,
} from "../invoice-utils";

/**
 * Extra coverage for `parseTxDate` focused on the textual `date` field as it
 * arrives from user input / legacy DB rows:
 *   - all 12 Portuguese short month tokens (jan..dez)
 *   - alternate capitalisations (UPPER, Title, MiXeD)
 *   - extra whitespace (leading/trailing, tabs, double spaces between parts)
 *   - single-digit day without padding ("3 jul")
 *   - each variation must yield the exact same billing-cycle key as the
 *     canonical "DD mmm" ISO-fallback form.
 */

const CLOSING_DAY = 10;
const DUE_DAY = 20;
const CREATED_AT = "2026-07-15T12:00:00Z";

const mkTx = (id: string, date: string, created_at = CREATED_AT): CardTransaction => ({
  id,
  name: `Tx ${id}`,
  icon: null,
  category: "x",
  date,
  amount: 100,
  type: "expense",
  created_at,
  total_installments: null,
  installment_number: null,
  installment_group_id: null,
});

const ALL_MONTHS: Array<[string, number]> = [
  ["jan", 0], ["fev", 1], ["mar", 2], ["abr", 3],
  ["mai", 4], ["jun", 5], ["jul", 6], ["ago", 7],
  ["set", 8], ["out", 9], ["nov", 10], ["dez", 11],
];

describe("parseTxDate — every short month token maps to the correct month index", () => {
  it.each(ALL_MONTHS)('"%s" → month index %i', (token, monthIdx) => {
    // Use a mid-year fallback so the Dec↔Jan year-boundary heuristic does
    // NOT engage (it only fires when textual jan meets Nov/Dec fallback,
    // or textual dez meets Jan/Feb fallback).
    const d = parseTxDate(`15 ${token}`, "2024-06-15T00:00:00Z");
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(monthIdx);
    expect(d.getDate()).toBe(15);
  });

  it("shortMonthMap covers all 12 months and nothing else", () => {
    expect(Object.keys(shortMonthMap).sort()).toEqual(
      ALL_MONTHS.map(([t]) => t).sort(),
    );
  });
});

describe("parseTxDate — capitalisation variants", () => {
  const CAPS = ["jul", "JUL", "Jul", "JuL", "jUL"];
  it.each(CAPS)('"%s" is treated identically to "jul"', (token) => {
    const d = parseTxDate(`07 ${token}`, CREATED_AT);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(7);
  });

  it("all-caps month combined with padded day resolves the same as lowercase", () => {
    const a = parseTxDate("08 DEZ", "2026-12-31T00:00:00Z");
    const b = parseTxDate("08 dez", "2026-12-31T00:00:00Z");
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("parseTxDate — whitespace tolerance", () => {
  const VARIANTS = [
    "05 jun",           // canonical
    " 05 jun",          // leading space
    "05 jun ",          // trailing space
    "  05  jun  ",      // padded on all sides
    "05\tjun",          // tab separator
    "05 \t jun",        // mixed tabs and spaces
    "05  jun",          // double space
    "\n05 jun\n",       // newlines
  ];
  it.each(VARIANTS)('"%s" resolves to 5 Jun 2026', (variant) => {
    const d = parseTxDate(variant, CREATED_AT);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(5);
  });

  it('single-digit day without padding ("3 jul") still parses', () => {
    const d = parseTxDate("3 jul", CREATED_AT);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(3);
  });
});

describe("parseTxDate — cycle-key stability across textual variants", () => {
  // All these variants describe the same real-world date (05 Jul 2026) and
  // therefore must group into the exact same billing cycle.
  const VARIANTS = [
    "05 jul",
    "05 JUL",
    "05 Jul",
    "  05  jul  ",
    "05\tjul",
    "5 jul",
    "5 JUL",
  ];
  const reference = new Date(2026, 6, 15);

  it.each(VARIANTS)('variant "%s" lands in the same cycle key as canonical "05 jul"', (variant) => {
    const canonical = groupByBillingCycle(
      [mkTx("c", "05 jul")],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );
    const test = groupByBillingCycle(
      [mkTx("t", variant)],
      CLOSING_DAY,
      DUE_DAY,
      reference,
    );
    const kc = canonical.find((p) => p.transactions.some((t) => t.id === "c"))?.key;
    const kt = test.find((p) => p.transactions.some((t) => t.id === "t"))?.key;
    expect(kc).toBeDefined();
    expect(kt).toBeDefined();
    expect(kt).toBe(kc);
  });

  it("case & whitespace variants of the same day across ALL 12 months share a cycle key with the canonical form", () => {
    // For each month, cycle-key equality is checked using a reference date
    // one day after the closing of that cycle so both routes clearly match.
    for (const [token, monthIdx] of ALL_MONTHS) {
      const ref = new Date(2026, monthIdx, 15);
      // Mid-year fallback avoids the Dec↔Jan year-boundary heuristic.
      const created = "2026-06-15T00:00:00Z";
      const canonical = groupByBillingCycle([mkTx("c", `05 ${token}`, created)], CLOSING_DAY, DUE_DAY, ref);
      const upper = groupByBillingCycle([mkTx("u", `05 ${token.toUpperCase()}`, created)], CLOSING_DAY, DUE_DAY, ref);
      const title = groupByBillingCycle([mkTx("t", `05 ${token[0].toUpperCase()}${token.slice(1)}`, created)], CLOSING_DAY, DUE_DAY, ref);
      const spacey = groupByBillingCycle([mkTx("s", `  05   ${token}  `, created)], CLOSING_DAY, DUE_DAY, ref);

      const keyFor = (periods: typeof canonical, id: string) =>
        periods.find((p) => p.transactions.some((tx) => tx.id === id))?.key;

      const kc = keyFor(canonical, "c");
      expect(kc, `canonical missing for ${token}`).toBeDefined();
      expect(keyFor(upper, "u"), `UPPER differs for ${token}`).toBe(kc);
      expect(keyFor(title, "t"), `Title differs for ${token}`).toBe(kc);
      expect(keyFor(spacey, "s"), `spaces differ for ${token}`).toBe(kc);
    }
  });

  it("multi-installment purchase with mixed-case + spacing variants keeps each parcela in its own cycle", () => {
    const groupId = "g-mix";
    const created = "2026-06-01T00:00:00Z";
    const txs: CardTransaction[] = [
      { ...mkTx("p1", "  15  Jun ", created), installment_number: 1, total_installments: 3, installment_group_id: groupId },
      { ...mkTx("p2", "15 JUL", created), installment_number: 2, total_installments: 3, installment_group_id: groupId },
      { ...mkTx("p3", "15\tAgO", created), installment_number: 3, total_installments: 3, installment_group_id: groupId },
    ];
    const ref = new Date(2026, 6, 5); // ref inside Jul cycle
    const periods = groupByBillingCycle(txs, CLOSING_DAY, DUE_DAY, ref);
    const cycleForMonth = (m: number) =>
      periods.find((p) => p.transactions.length > 0 && p.dueDate.getMonth() === m);

    // Cycles containing 15-of-month, closing day 10, due day 20:
    //   15 Jun → close 10 Jul → due 20 Jul (month 6)
    //   15 Jul → close 10 Aug → due 20 Aug (month 7)
    //   15 Aug → close 10 Sep → due 20 Sep (month 8)
    expect(cycleForMonth(6)?.transactions.map((t) => t.id)).toEqual(["p1"]);
    expect(cycleForMonth(7)?.transactions.map((t) => t.id)).toEqual(["p2"]);
    expect(cycleForMonth(8)?.transactions.map((t) => t.id)).toEqual(["p3"]);
  });
});
