import { describe, it, expect } from "vitest";
import { resolveInvoiceOrder } from "@/lib/invoice-order-snapshot";

describe("resolveInvoiceOrder — invoice list stability across edits", () => {
  it("captures snapshot on first open", () => {
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["a", "b", "c"],
      priorSnapshot: undefined,
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["a", "b", "c"]);
    expect(nextSnapshot).toEqual(["a", "b", "c"]);
  });

  it("keeps snapshot order when data refetches after an edit (no reshuffle)", () => {
    // Simulate a refetch that returns the same rows in a different order
    // (e.g. edited row moved to the top by created_at DESC).
    const priorSnapshot = ["a", "b", "c", "d"];
    const currentIds = ["c", "a", "b", "d"]; // reordered by cache
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds,
      priorSnapshot,
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["a", "b", "c", "d"]);
    expect(nextSnapshot).toEqual(priorSnapshot);
  });

  it("edits that change amount/category but keep ids do not affect order", () => {
    const priorSnapshot = ["t1", "t2", "t3"];
    // Same ids, arbitrary new order from server:
    const currentIds = ["t3", "t1", "t2"];
    const { orderedIds } = resolveInvoiceOrder({
      currentIds,
      priorSnapshot,
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["t1", "t2", "t3"]);
  });

  it("respects deletions (ghost rows removed) but keeps order", () => {
    const { orderedIds } = resolveInvoiceOrder({
      currentIds: ["a", "c"], // "b" deleted
      priorSnapshot: ["a", "b", "c"],
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["a", "c"]);
  });

  it("appends new ids at the end without reshuffling the frozen prefix", () => {
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["a", "b", "c", "z-new"],
      priorSnapshot: ["a", "b", "c"],
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["a", "b", "c", "z-new"]);
    // Snapshot extends so subsequent refetches keep z-new pinned at the end.
    expect(nextSnapshot).toEqual(["a", "b", "c", "z-new"]);
  });

  it("merge/replace: dropped ids removed, replacement appended predictably", () => {
    // 'b' was merged into 'b2'; server now returns b2 in the middle.
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["a", "b2", "c"],
      priorSnapshot: ["a", "b", "c"],
      dialogOpen: true,
    });
    // frozen prefix keeps [a, c] (b dropped); b2 appended at the end.
    expect(orderedIds).toEqual(["a", "c", "b2"]);
    expect(nextSnapshot).toEqual(["a", "b", "c", "b2"]);
  });

  it("preserves relative order among multiple newcomers as returned by server", () => {
    const { orderedIds } = resolveInvoiceOrder({
      currentIds: ["n1", "a", "n2", "b", "n3"],
      priorSnapshot: ["a", "b"],
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["a", "b", "n1", "n2", "n3"]);
  });

  it("all snapshot ids gone: falls back to current server order without reshuffle", () => {
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["x", "y", "z"],
      priorSnapshot: ["a", "b", "c"],
      dialogOpen: true,
    });
    expect(orderedIds).toEqual(["x", "y", "z"]);
    expect(nextSnapshot).toEqual(["a", "b", "c", "x", "y", "z"]);
  });


  it("clears snapshot when dialog is closed (returns null for caller to drop)", () => {
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["x", "y", "z"],
      priorSnapshot: ["a", "b", "c"], // stale
      dialogOpen: false,
    });
    expect(orderedIds).toEqual(["x", "y", "z"]);
    expect(nextSnapshot).toBeNull();
  });

  it("open → edit → close → reopen: reopen captures fresh order at open moment", () => {
    // 1) open — take snapshot
    let state = resolveInvoiceOrder({
      currentIds: ["a", "b", "c"],
      priorSnapshot: undefined,
      dialogOpen: true,
    });
    expect(state.orderedIds).toEqual(["a", "b", "c"]);

    // 2) edit while open — server reorders; visible order stays; snapshot stable
    state = resolveInvoiceOrder({
      currentIds: ["b", "a", "c"],
      priorSnapshot: state.nextSnapshot ?? undefined,
      dialogOpen: true,
    });
    expect(state.orderedIds).toEqual(["a", "b", "c"]);

    // 3) close — snapshot is cleared (null)
    state = resolveInvoiceOrder({
      currentIds: ["b", "a", "c"],
      priorSnapshot: state.nextSnapshot ?? undefined,
      dialogOpen: false,
    });
    expect(state.nextSnapshot).toBeNull();


    // 4) reopen — new snapshot captured from refreshed data
    state = resolveInvoiceOrder({
      currentIds: ["b", "a", "c"],
      priorSnapshot: undefined, // simulating the onOpenChange clear
      dialogOpen: true,
    });
    expect(state.orderedIds).toEqual(["b", "a", "c"]);
  });

  it("is idempotent when called repeatedly with the same inputs", () => {
    const prior = ["a", "b", "c"];
    const current = ["c", "b", "a"];
    const first = resolveInvoiceOrder({ currentIds: current, priorSnapshot: prior, dialogOpen: true });
    const second = resolveInvoiceOrder({ currentIds: current, priorSnapshot: first.nextSnapshot ?? undefined, dialogOpen: true });
    expect(second.orderedIds).toEqual(first.orderedIds);
    expect(second.nextSnapshot).toEqual(first.nextSnapshot);
  });
});
