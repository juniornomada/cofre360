import { describe, it, expect } from "vitest";
import { resolveInvoiceOrder } from "@/lib/invoice-order-snapshot";

/**
 * Integration tests that simulate the full lifecycle of the invoice dialog
 * across React Query refetches. Each `step()` mimics a render pass: it reads
 * the current server-provided ids, consults the persisted snapshot (a Map
 * indexed by orderKey, exactly like `invoiceOrderRef` in cards.tsx), and
 * returns the visible order for that render.
 */

type Tx = { id: string; amount: number; category: string };

function createHarness(orderKey: string) {
  const store = new Map<string, string[]>();
  let dialogOpen = false;

  return {
    open() {
      dialogOpen = true;
    },
    close() {
      dialogOpen = false;
    },
    /** Simulates one render / refetch. Returns the ordered rows on screen. */
    render(serverRows: Tx[]): Tx[] {
      const currentIds = serverRows.map((t) => t.id);
      const prior = store.get(orderKey);
      const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
        currentIds,
        priorSnapshot: prior,
        dialogOpen,
      });
      if (nextSnapshot === null) store.delete(orderKey);
      else store.set(orderKey, nextSnapshot);

      const byId = new Map(serverRows.map((t) => [t.id, t]));
      return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
    },
    snapshot() {
      return store.get(orderKey);
    },
  };
}

describe("invoice dialog — integration: order stable across cache refetches", () => {
  it("keeps the initial order across many refetches while dialog is open", () => {
    const h = createHarness("card1::2026-01-15");
    const initial: Tx[] = [
      { id: "t1", amount: 100, category: "food" },
      { id: "t2", amount: 50, category: "transport" },
      { id: "t3", amount: 25, category: "leisure" },
      { id: "t4", amount: 300, category: "food" },
    ];

    h.open();
    const first = h.render(initial);
    expect(first.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);

    // Refetch #1: server returned rows in a different order.
    const refetch1 = h.render([initial[3], initial[0], initial[2], initial[1]]);
    expect(refetch1.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);

    // Refetch #2: same ids, yet another order.
    const refetch2 = h.render([initial[1], initial[2], initial[3], initial[0]]);
    expect(refetch2.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);

    // Refetch #3: identity permutation.
    const refetch3 = h.render(initial);
    expect(refetch3.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("preserves order when a row's amount/category is edited (row content changes)", () => {
    const h = createHarness("card1::2026-01-15");
    const rows: Tx[] = [
      { id: "t1", amount: 100, category: "food" },
      { id: "t2", amount: 50, category: "transport" },
      { id: "t3", amount: 25, category: "leisure" },
    ];

    h.open();
    expect(h.render(rows).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);

    // User edits t2 amount → server reorders (created_at DESC-like) and
    // returns t2 first with a new amount.
    const edited: Tx[] = [
      { id: "t2", amount: 999, category: "transport" },
      { id: "t1", amount: 100, category: "food" },
      { id: "t3", amount: 25, category: "leisure" },
    ];
    const afterEdit = h.render(edited);
    expect(afterEdit.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    // Content update is reflected in the visible row.
    expect(afterEdit[1].amount).toBe(999);
  });

  it("removes a deleted row without shifting neighbors", () => {
    const h = createHarness("card1::2026-01-15");
    const rows: Tx[] = [
      { id: "t1", amount: 100, category: "food" },
      { id: "t2", amount: 50, category: "transport" },
      { id: "t3", amount: 25, category: "leisure" },
      { id: "t4", amount: 300, category: "food" },
    ];

    h.open();
    h.render(rows);

    // t2 deleted; server returns remaining rows in arbitrary order.
    const afterDelete = h.render([rows[3], rows[0], rows[2]]);
    expect(afterDelete.map((t) => t.id)).toEqual(["t1", "t3", "t4"]);
  });

  it("ignores new ids arriving mid-session: they append at the end, never in the middle", () => {
    const h = createHarness("card1::2026-01-15");
    h.open();
    h.render([
      { id: "t1", amount: 10, category: "a" },
      { id: "t2", amount: 20, category: "b" },
      { id: "t3", amount: 30, category: "c" },
    ]);

    // A new transaction is created and, per server sort, would land in the
    // middle of the list.
    const withNewcomer = h.render([
      { id: "t1", amount: 10, category: "a" },
      { id: "new", amount: 15, category: "x" },
      { id: "t2", amount: 20, category: "b" },
      { id: "t3", amount: 30, category: "c" },
    ]);
    expect(withNewcomer.map((t) => t.id)).toEqual(["t1", "t2", "t3", "new"]);

    // Another refetch: newcomer stays pinned at the end.
    const refetch = h.render([
      { id: "new", amount: 15, category: "x" },
      { id: "t3", amount: 30, category: "c" },
      { id: "t1", amount: 10, category: "a" },
      { id: "t2", amount: 20, category: "b" },
    ]);
    expect(refetch.map((t) => t.id)).toEqual(["t1", "t2", "t3", "new"]);
  });

  it("close → reopen: new rows created while closed appear at the end", () => {
    const h = createHarness("card1::2026-01-15");
    const initial: Tx[] = [
      { id: "t1", amount: 10, category: "a" },
      { id: "t2", amount: 20, category: "b" },
    ];

    h.open();
    expect(h.render(initial).map((t) => t.id)).toEqual(["t1", "t2"]);
    h.close();

    // While closed, a background refetch brings a new row.
    h.render([...initial, { id: "t3", amount: 30, category: "c" }]);

    // User reopens; server returns rows in a different order.
    h.open();
    const reopened = h.render([
      { id: "t3", amount: 30, category: "c" },
      { id: "t1", amount: 10, category: "a" },
      { id: "t2", amount: 20, category: "b" },
    ]);
    expect(reopened.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("stress: 25 refetches with random permutations never change the visible order", () => {
    const h = createHarness("card1::2026-01-15");
    const rows: Tx[] = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i + 1}`,
      amount: (i + 1) * 10,
      category: `cat${i % 3}`,
    }));
    const canonicalIds = rows.map((r) => r.id);

    h.open();
    expect(h.render(rows).map((t) => t.id)).toEqual(canonicalIds);

    // Deterministic pseudo-shuffle across 25 refetches.
    let seed = 1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 25; i++) {
      const shuffled = rows.slice().sort(() => rand() - 0.5);
      const visible = h.render(shuffled).map((t) => t.id);
      expect(visible).toEqual(canonicalIds);
    }
  });

  it("multiple periods share the same store without cross-contamination", () => {
    const store = new Map<string, string[]>();
    const dialogOpen = true;

    function step(orderKey: string, ids: string[]) {
      const prior = store.get(orderKey);
      const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
        currentIds: ids,
        priorSnapshot: prior,
        dialogOpen,
      });
      if (nextSnapshot === null) store.delete(orderKey);
      else store.set(orderKey, nextSnapshot);
      return orderedIds;
    }

    // Period A captured first.
    expect(step("card1::2026-01-15", ["a1", "a2", "a3"])).toEqual(["a1", "a2", "a3"]);
    // Period B captured separately.
    expect(step("card1::2026-02-15", ["b1", "b2"])).toEqual(["b1", "b2"]);
    // Refetch on A: server reorders — visible order must stay stable.
    expect(step("card1::2026-01-15", ["a3", "a1", "a2"])).toEqual(["a1", "a2", "a3"]);
    // Refetch on B: unaffected by A.
    expect(step("card1::2026-02-15", ["b2", "b1"])).toEqual(["b1", "b2"]);
  });
});
