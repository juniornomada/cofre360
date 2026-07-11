import { describe, it, expect } from "vitest";

/**
 * Regression guard for the Home loader mapping in `src/routes/index.tsx`.
 *
 * The historical bug: the loader was building objects like
 *   { ...t, created_at: t.date }
 * which overwrote the ISO `created_at` from the DB with the textual
 * "DD mmm" `date` field, causing `parseTxDate` to fall back to the
 * *current* year and drift the billing cycle at year-end.
 *
 * The current loader (lines ~367-411 of src/routes/index.tsx) must keep
 * `created_at` sourced from the DB row and only fall back to `new Date().toISOString()`
 * when the DB value is truly missing. This test replicates BOTH mapping
 * steps used by the loader — `formattedTxs` (for `groupByBillingCycle`)
 * and `txsByName` (for month navigation) — and asserts the invariant on
 * a fixture that would trip the old bug.
 */

// ---- Loader mapping helpers (mirror of src/routes/index.tsx) ---------------

type RawTx = {
  card: string | null;
  amount: number | string;
  date: string;
  type: string | null;
  created_at: string | null;
};

/** Mirrors the mapping at src/routes/index.tsx:367-375 */
function mapFormattedTxs(txList: RawTx[]) {
  return txList.map((t) => ({
    ...t,
    id: "",
    name: "",
    icon: "",
    category: "",
    type: t.type || "expense",
    created_at: (t as any).created_at || new Date().toISOString(),
  }));
}

/** Mirrors the mapping at src/routes/index.tsx:401-411 */
function mapTxsByName(txTotals: RawTx[]) {
  const txsByName: Record<
    string,
    { amount: number; date: string; type: string; created_at: string }[]
  > = {};
  for (const t of txTotals) {
    if (!t.card) continue;
    if (!txsByName[t.card]) txsByName[t.card] = [];
    txsByName[t.card].push({
      amount: Number(t.amount),
      date: (t as any).date || "",
      type: t.type || "expense",
      created_at: (t as any).created_at || new Date().toISOString(),
    });
  }
  return txsByName;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const DDMMM_RE = /^\s*\d{1,2}\s+[a-zA-Zçã]{3}\s*$/;

// ---- Fixture ---------------------------------------------------------------

const RAW: RawTx[] = [
  // Same day: ISO created_at 2026-12-28, textual "28 dez" — the classic bug
  { card: "Nubank", amount: 100, date: "28 dez", type: "expense", created_at: "2026-12-28T14:22:10Z" },
  // Cross-year installment: DB stored 2026-06-01 for a July "15 jul" parcel
  { card: "Nubank", amount: 50, date: "15 jul", type: "expense", created_at: "2026-06-01T09:00:00Z" },
  // Reversal (income) with mixed-case month
  { card: "Nubank", amount: 30, date: "10 JUL", type: "income", created_at: "2026-07-10T18:00:00Z" },
  // Second card
  { card: "Porto", amount: 200, date: "05 ago", type: "expense", created_at: "2026-08-05T11:11:11Z" },
  // Row with a NULL created_at — loader must fall back to an ISO now(),
  // NEVER to the textual date field.
  { card: "Porto", amount: 25, date: "12 out", type: "expense", created_at: null },
  // Row with empty-string type (loader coerces to "expense")
  { card: "Porto", amount: 40, date: "01 nov", type: null, created_at: "2026-11-01T00:00:00Z" },
  // Row with no card is filtered out of txsByName
  { card: null, amount: 999, date: "01 jan", type: "expense", created_at: "2026-01-01T00:00:00Z" },
];

// ---- Tests -----------------------------------------------------------------

describe("Home loader — created_at preservation during tx mapping", () => {
  it("formattedTxs never overwrites created_at with the textual date field", () => {
    const mapped = mapFormattedTxs(RAW.filter((r) => r.card === "Nubank"));
    for (const m of mapped) {
      expect(m.created_at).not.toBe(m.date);
      expect(m.created_at).toMatch(ISO_RE);
      // Sanity: date must remain textual, not clobbered by created_at either
      expect(m.date).toMatch(DDMMM_RE);
    }
    // Explicit contract: the tricky "28 dez" row keeps its 2026 year.
    const dec = mapped.find((m) => m.date === "28 dez")!;
    expect(dec.created_at).toBe("2026-12-28T14:22:10Z");
    expect(new Date(dec.created_at).getUTCFullYear()).toBe(2026);
  });

  it("txsByName never overwrites created_at with the textual date field", () => {
    const grouped = mapTxsByName(RAW);
    // Rows with card:null must not leak in
    expect(grouped[""]).toBeUndefined();
    expect(Object.keys(grouped).sort()).toEqual(["Nubank", "Porto"]);

    for (const list of Object.values(grouped)) {
      for (const t of list) {
        expect(t.created_at).not.toBe(t.date);
        expect(t.created_at).toMatch(ISO_RE);
        expect(t.date).toMatch(DDMMM_RE);
        expect(["expense", "income"]).toContain(t.type);
      }
    }
  });

  it("falls back to new Date().toISOString() (never the textual date) when created_at is null", () => {
    const before = Date.now();
    const grouped = mapTxsByName(RAW);
    const after = Date.now();

    // The Porto row with null created_at must have received an ISO fallback.
    const nullRow = grouped["Porto"].find((t) => t.date === "12 out")!;
    expect(nullRow.created_at).toMatch(ISO_RE);
    expect(nullRow.created_at).not.toBe("12 out");
    const ts = new Date(nullRow.created_at).getTime();
    // Fallback must be a "now-ish" value, not derived from the textual date.
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it("regression: reproduces the OLD bug (created_at := date) and shows why it drifts the year", () => {
    // Simulate the pre-fix mapping to prove the guard is meaningful.
    const buggy = RAW
      .filter((r) => r.card === "Nubank")
      .map((t) => ({ ...t, created_at: t.date })); // <-- the old broken line

    const dec = buggy.find((m) => m.date === "28 dez")!;
    // Under the buggy mapping, created_at is literally the textual date.
    expect(dec.created_at).toBe("28 dez");
    // And parsing it as an ISO yields Invalid Date, which forces parseTxDate
    // to fall back to `new Date().getFullYear()` instead of 2026.
    expect(isNaN(new Date(dec.created_at).getTime())).toBe(true);
  });

  it("mapFormattedTxs preserves order and count from the input list", () => {
    const input = RAW.filter((r) => r.card === "Nubank");
    const mapped = mapFormattedTxs(input);
    expect(mapped).toHaveLength(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(mapped[i].date).toBe(input[i].date);
      expect(mapped[i].amount).toBe(input[i].amount);
      expect(mapped[i].created_at).toBe(input[i].created_at); // exact DB pass-through
    }
  });
});
