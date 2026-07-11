import { describe, it, expect } from "vitest";
import { resolveInvoiceOrder } from "@/lib/invoice-order-snapshot";

/**
 * Integration tests for period switching. The invoice dialog can navigate
 * between billing periods (activeInvoiceIdx). Each period is keyed
 * independently in the caller-owned snapshot store, so switching must:
 *   - show only ids that belong to the current period
 *   - preserve each period's captured order in isolation
 *   - never leak ids across periods
 */

type Tx = { id: string; period: string };

function createMultiPeriodHarness() {
  const store = new Map<string, string[]>();
  let dialogOpen = true;

  function keyFor(cardId: string, endDate: string) {
    return `${cardId}::${endDate}`;
  }

  return {
    setDialogOpen(v: boolean) {
      dialogOpen = v;
    },
    render(cardId: string, endDate: string, rows: Tx[]): Tx[] {
      const orderKey = keyFor(cardId, endDate);
      const currentIds = rows.map((r) => r.id);
      const prior = store.get(orderKey);
      const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
        currentIds,
        priorSnapshot: prior,
        dialogOpen,
      });
      if (nextSnapshot === null) store.delete(orderKey);
      else store.set(orderKey, nextSnapshot);
      const byId = new Map(rows.map((r) => [r.id, r]));
      return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
    },
    snapshot(cardId: string, endDate: string) {
      return store.get(keyFor(cardId, endDate));
    },
    storeSize() {
      return store.size;
    },
  };
}

describe("invoice dialog — period switching keeps recortes isolated", () => {
  const CARD = "card-A";

  const jan: Tx[] = [
    { id: "jan-1", period: "jan" },
    { id: "jan-2", period: "jan" },
    { id: "jan-3", period: "jan" },
  ];
  const feb: Tx[] = [
    { id: "feb-1", period: "feb" },
    { id: "feb-2", period: "feb" },
  ];
  const mar: Tx[] = [
    { id: "mar-1", period: "mar" },
    { id: "mar-2", period: "mar" },
    { id: "mar-3", period: "mar" },
    { id: "mar-4", period: "mar" },
  ];

  it("shows only ids of the currently selected period", () => {
    const h = createMultiPeriodHarness();

    const janView = h.render(CARD, "2026-01-15", jan);
    expect(janView.every((t) => t.period === "jan")).toBe(true);
    expect(janView.map((t) => t.id)).toEqual(["jan-1", "jan-2", "jan-3"]);

    const febView = h.render(CARD, "2026-02-15", feb);
    expect(febView.every((t) => t.period === "feb")).toBe(true);
    expect(febView.map((t) => t.id)).toEqual(["feb-1", "feb-2"]);

    const marView = h.render(CARD, "2026-03-15", mar);
    expect(marView.every((t) => t.period === "mar")).toBe(true);
    expect(marView.map((t) => t.id)).toEqual(["mar-1", "mar-2", "mar-3", "mar-4"]);
  });

  it("preserves each period's captured order independently when navigating back and forth", () => {
    const h = createMultiPeriodHarness();

    // First visit captures each period.
    h.render(CARD, "2026-01-15", jan);
    h.render(CARD, "2026-02-15", feb);
    h.render(CARD, "2026-03-15", mar);

    // Server permutes January rows on the next visit — order must stay.
    const janAgain = h.render(CARD, "2026-01-15", [jan[2], jan[0], jan[1]]);
    expect(janAgain.map((t) => t.id)).toEqual(["jan-1", "jan-2", "jan-3"]);

    // February permuted — still stable.
    const febAgain = h.render(CARD, "2026-02-15", [feb[1], feb[0]]);
    expect(febAgain.map((t) => t.id)).toEqual(["feb-1", "feb-2"]);

    // March permuted — still stable.
    const marAgain = h.render(CARD, "2026-03-15", [mar[3], mar[2], mar[1], mar[0]]);
    expect(marAgain.map((t) => t.id)).toEqual(["mar-1", "mar-2", "mar-3", "mar-4"]);
  });

  it("new transactions in a specific period only affect that period", () => {
    const h = createMultiPeriodHarness();

    h.render(CARD, "2026-01-15", jan);
    h.render(CARD, "2026-02-15", feb);

    // A new transaction appears in February; interleaved by the server.
    const febWithNew = h.render(CARD, "2026-02-15", [
      feb[0],
      { id: "feb-new", period: "feb" },
      feb[1],
    ]);
    expect(febWithNew.map((t) => t.id)).toEqual(["feb-1", "feb-2", "feb-new"]);

    // January is untouched — no leak from February.
    const janUntouched = h.render(CARD, "2026-01-15", jan);
    expect(janUntouched.map((t) => t.id)).toEqual(["jan-1", "jan-2", "jan-3"]);

    // Snapshots are isolated per key.
    expect(h.snapshot(CARD, "2026-01-15")).toEqual(["jan-1", "jan-2", "jan-3"]);
    expect(h.snapshot(CARD, "2026-02-15")).toEqual(["feb-1", "feb-2", "feb-new"]);
  });

  it("dropping the dialog and switching periods does not merge ids across recortes", () => {
    const h = createMultiPeriodHarness();

    h.render(CARD, "2026-01-15", jan);
    h.setDialogOpen(false);
    // Close on Jan, switch selector to Feb before reopening.
    h.render(CARD, "2026-02-15", feb);
    h.setDialogOpen(true);

    // Reopen on Feb — must NOT contain Jan ids.
    const febView = h.render(CARD, "2026-02-15", feb);
    expect(febView.map((t) => t.id)).toEqual(["feb-1", "feb-2"]);
    expect(febView.some((t) => t.period === "jan")).toBe(false);
  });

  it("full-invalidation reset: reusing a key across recortes discards the stale snapshot", () => {
    // Simulates a defensive fallback: if a caller accidentally reused a
    // snapshot bucket across periods, the helper must not glue unrelated
    // ids together — it resets to the fresh order.
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["mar-1", "mar-2", "mar-3", "mar-4"],
      priorSnapshot: ["jan-1", "jan-2", "jan-3"],
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["mar-1", "mar-2", "mar-3", "mar-4"]);
    expect(nextSnapshot).toEqual(["mar-1", "mar-2", "mar-3", "mar-4"]);
  });

  it("card switch is also isolated: same period on a different card is a fresh bucket", () => {
    const h = createMultiPeriodHarness();
    const cardBRows: Tx[] = [
      { id: "b-jan-1", period: "jan" },
      { id: "b-jan-2", period: "jan" },
    ];

    h.render(CARD, "2026-01-15", jan);
    const cardBView = h.render("card-B", "2026-01-15", cardBRows);
    expect(cardBView.map((t) => t.id)).toEqual(["b-jan-1", "b-jan-2"]);
    // No id from card A leaked in.
    expect(cardBView.some((t) => t.id.startsWith("jan-"))).toBe(false);
    expect(h.storeSize()).toBe(2);
  });
});
