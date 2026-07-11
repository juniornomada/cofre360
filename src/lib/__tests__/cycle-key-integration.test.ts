import { describe, it, expect } from "vitest";
import {
  parseTxDate,
  groupByBillingCycle,
  getCycleDates,
  type CardTransaction,
} from "../invoice-utils";

/**
 * End-to-end integration: verifies that the cycle-key logic in
 * `groupByBillingCycle` funnels every transaction through `parseTxDate`
 * and that transactions land in the correct billing period regardless of
 * how the user typed the `date` field (textual month, numeric DD/MM,
 * ISO, accented, with separators, near the Dec↔Jan boundary, etc.).
 *
 * The contract under test:
 *   - Two transactions whose `date` fields parse to the same calendar day
 *     MUST share the same cycle key.
 *   - The cycle key must match the one computed directly from
 *     `parseTxDate(...)` + `getCycleDates(...)`.
 *   - Aggregation totals per period must reflect the parsed classification.
 */

const CLOSING = 10;
const DUE = 20;

let seq = 0;
function tx(
  dateText: string,
  createdAt: string,
  amount = 100,
  type: "expense" | "income" = "expense",
): CardTransaction {
  return {
    id: `t${++seq}`,
    name: `Tx ${seq}`,
    icon: null,
    category: "food",
    card: "Card",
    date: dateText,
    amount,
    type,
    created_at: createdAt,
    total_installments: null,
    installment_number: null,
    installment_group_id: null,
  };
}

/** Expected cycle key for a given parsed date, derived from `getCycleDates`. */
function expectedKey(parsed: Date, reference: Date): string {
  const { currentClose, prevClose } = getCycleDates(reference, CLOSING, DUE);
  const pastClose = new Date(prevClose.getFullYear(), prevClose.getMonth() - 1, CLOSING);
  if (parsed >= pastClose && parsed < prevClose) return "past";
  if (parsed >= prevClose && parsed < currentClose) return "current";
  // Otherwise it's a future cycle: walk forward until it fits.
  let start = new Date(currentClose);
  let idx = 0;
  while (idx < 24) {
    const end = new Date(start.getFullYear(), start.getMonth() + 1, CLOSING);
    if (parsed >= start && parsed < end) return `future_${idx}`;
    start = end;
    idx++;
  }
  return "unknown";
}

describe("cycle key ↔ parseTxDate — end-to-end integration", () => {
  it("textual, numeric and ISO variants of the same day share the same cycle key", () => {
    const reference = new Date(2026, 6, 15); // 15 Jul 2026
    const createdAt = "2026-07-10T12:00:00Z";
    const variants = [
      "10 jul",
      "10 julho",
      "10 Jul",
      "10/07",
      "10-07",
      "10/07/2026",
      "10-07-2026",
      "10/07/26",
      "2026-07-10",
      "2026/07/10",
    ];
    const txs = variants.map((v) => tx(v, createdAt));
    const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);

    const keysByTxId = new Map<string, string>();
    for (const p of periods) {
      for (const t of p.transactions) keysByTxId.set(t.id, p.key);
    }
    const uniqueKeys = new Set(keysByTxId.values());
    expect(uniqueKeys.size, `all variants must share one key, got ${[...uniqueKeys].join(",")}`).toBe(1);
    expect([...uniqueKeys][0]).toBe(expectedKey(parseTxDate("10 jul", createdAt), reference));
  });

  it("aggregates totals per cycle for a mixed batch of dates", () => {
    const reference = new Date(2026, 6, 15); // 15 Jul 2026
    // With closing=10, due=20 (relative to 15 Jul 2026):
    //   past    = [10 May, 10 Jun)
    //   current = [10 Jun, 10 Jul)
    //   future_0 = [10 Jul, 10 Aug)
    //   future_1 = [10 Aug, 10 Sep)
    const txs = [
      tx("15 mai", "2026-05-15T00:00:00Z", 50),   // past
      tx("20/05", "2026-05-20T00:00:00Z", 30),    // past
      tx("15 jun", "2026-06-15T00:00:00Z", 100),  // current
      tx("2026-06-20", "2026-06-20T00:00:00Z", 200), // current
      tx("05/07", "2026-07-05T00:00:00Z", 25, "income"), // current (income → subtracts)
      tx("15 jul", "2026-07-15T00:00:00Z", 400),  // future_0
      tx("15/08", "2026-08-15T00:00:00Z", 500),   // future_1
    ];

    const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);
    const byKey = new Map(periods.map((p) => [p.key, p]));

    expect(byKey.get("past")!.total).toBe(80);        // 50 + 30
    expect(byKey.get("current")!.total).toBe(275);    // 100 + 200 - 25
    expect(byKey.get("future_0")!.total).toBe(400);
    expect(byKey.get("future_1")!.total).toBe(500);

    // And each tx.id is in the period whose key matches expectedKey(parseTxDate(...)).
    for (const t of txs) {
      const parsed = parseTxDate(t.date, t.created_at);
      const expected = expectedKey(parsed, reference);
      const found = periods.find((p) => p.transactions.some((x) => x.id === t.id));
      expect(found, `tx ${t.id} (${t.date}) must land in a period`).toBeDefined();
      expect(found!.key, `tx ${t.id} (${t.date}) expected ${expected}`).toBe(expected);
    }
  });

  it("Dec/Jan boundary: late-Dec and mid-Jan land in adjacent cycles, never swapped", () => {
    const reference = new Date(2027, 0, 15); // 15 Jan 2027
    // With closing=10, due=20 (relative to 15 Jan 2027):
    //   prevClose    = 10 Dec 2026
    //   currentClose = 10 Jan 2027
    //   future_0     = [10 Jan 2027, 10 Feb 2027)
    // → 31 Dec 2026 lands in "current"; 15 Jan 2027 lands in "future_0".
    const txs = [
      // "31/12" typed on 01 Jan 2027 → must resolve to 31 Dec 2026 (heuristic)
      tx("31/12", "2027-01-01T00:30:00Z", 100),
      // "31 dez" same day, textual form
      tx("31 dez", "2027-01-01T00:31:00Z", 200),
      // "15/01" typed on NYE 2026 → must resolve to 15 Jan 2027 (heuristic)
      tx("15/01", "2026-12-31T23:59:00Z", 300),
      // "15 jan" same
      tx("15 jan", "2026-12-31T23:58:00Z", 400),
    ];

    const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);
    const keyOf = (id: string) =>
      periods.find((p) => p.transactions.some((t) => t.id === id))!.key;

    // The two Dec txs share a key.
    expect(keyOf(txs[0].id)).toBe(keyOf(txs[1].id));
    // The two Jan txs share a key.
    expect(keyOf(txs[2].id)).toBe(keyOf(txs[3].id));
    // Dec and Jan keys differ.
    expect(keyOf(txs[0].id)).not.toBe(keyOf(txs[2].id));

    expect(keyOf(txs[0].id)).toBe("current");
    expect(keyOf(txs[2].id)).toBe("future_0");
  });

  it("cycle key stability under textual-format fuzz (12 months × 8 variants)", () => {
    const ptMonths = [
      "jan", "fev", "mar", "abr", "mai", "jun",
      "jul", "ago", "set", "out", "nov", "dez",
    ];
    const longMonths = [
      "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];

    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const day = 15;
      const dd = String(day).padStart(2, "0");
      const mm = String(mIdx + 1).padStart(2, "0");
      // Reference sits inside the target month so every variant materialises
      // a matching cycle. created_at anchored to the same day makes the
      // heuristic a no-op → all variants must share one key.
      const reference = new Date(2026, mIdx, 20);
      const created = new Date(Date.UTC(2026, mIdx, day, 12, 0, 0)).toISOString();
      const variants = [
        `${dd} ${ptMonths[mIdx]}`,
        `${dd} ${ptMonths[mIdx].toUpperCase()}`,
        `${dd} ${longMonths[mIdx]}`,
        `${dd}/${mm}`,
        `${dd}-${mm}`,
        `${dd}/${mm}/2026`,
        `${dd}/${mm}/26`,
        `2026-${mm}-${dd}`,
      ];
      const txs = variants.map((v) => tx(v, created));
      const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);
      // Every variant must have been placed somewhere.
      const placed = periods.flatMap((p) => p.transactions.map((t) => t.id));
      expect(placed.length, `month=${mIdx + 1} not all variants placed`).toBe(variants.length);
      const keys = new Set<string>();
      for (const p of periods) for (const t of p.transactions) keys.add(p.key);
      expect(
        keys.size,
        `month=${mIdx + 1} variants scattered across keys: ${[...keys].join(",")}`,
      ).toBe(1);
      const expected = expectedKey(parseTxDate(variants[0], created), reference);
      expect([...keys][0]).toBe(expected);
    }
  });

  it("dueDate on each returned period matches the closing → due mapping", () => {
    const reference = new Date(2026, 6, 15);
    const periods = groupByBillingCycle(
      [tx("15 jun", "2026-06-15T00:00:00Z"), tx("15 jul", "2026-07-15T00:00:00Z")],
      CLOSING,
      DUE,
      reference,
    );
    for (const p of periods) {
      // due must be strictly after end (closing) date.
      expect(p.dueDate.getTime()).toBeGreaterThan(p.endDate.getTime());
      // due day-of-month equals configured DUE.
      expect(p.dueDate.getDate()).toBe(DUE);
    }
  });

  it("empty date + fallback created_at still routes to the correct cycle", () => {
    const reference = new Date(2026, 6, 15);
    const t = tx("", "2026-06-20T12:00:00Z", 50); // parses to 20 Jun 2026 → current
    const periods = groupByBillingCycle([t], CLOSING, DUE, reference);
    const found = periods.find((p) => p.transactions.some((x) => x.id === t.id));
    expect(found).toBeDefined();
    expect(found!.key).toBe("current");
  });

  it("transactions far in the future materialize successive future_N cycles", () => {
    const reference = new Date(2026, 6, 15);
    const txs = [
      tx("15/07", "2026-07-15T00:00:00Z", 10), // future_0
      tx("15/08", "2026-08-15T00:00:00Z", 20), // future_1
      tx("15/09", "2026-09-15T00:00:00Z", 30), // future_2
      tx("15/10", "2026-10-15T00:00:00Z", 40), // future_3
    ];
    const periods = groupByBillingCycle(txs, CLOSING, DUE, reference);
    const keys = txs.map(
      (t) => periods.find((p) => p.transactions.some((x) => x.id === t.id))!.key,
    );
    expect(keys).toEqual(["future_0", "future_1", "future_2", "future_3"]);
  });
});
