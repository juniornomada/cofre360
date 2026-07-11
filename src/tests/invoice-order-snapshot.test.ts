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


  it("persists snapshot when dialog is closed (does not clear)", () => {
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds: ["a", "b", "c"],
      priorSnapshot: ["a", "b", "c"],
      dialogOpen: false,
    });
    expect(orderedIds).toEqual(["a", "b", "c"]);
    expect(nextSnapshot).toEqual(["a", "b", "c"]);
  });

  it("reopen after close: new transactions appear at the end without shuffling", () => {
    // 1) open — capture snapshot
    let state = resolveInvoiceOrder({
      currentIds: ["a", "b", "c"],
      priorSnapshot: undefined,
      dialogOpen: true,
    });
    expect(state.orderedIds).toEqual(["a", "b", "c"]);

    // 2) close — snapshot persists
    state = resolveInvoiceOrder({
      currentIds: ["a", "b", "c"],
      priorSnapshot: state.nextSnapshot ?? undefined,
      dialogOpen: false,
    });
    expect(state.nextSnapshot).toEqual(["a", "b", "c"]);

    // 3) while closed, two new transactions are created; server returns them
    //    interleaved by date (e.g. between b and c).
    state = resolveInvoiceOrder({
      currentIds: ["a", "b", "new1", "c", "new2"],
      priorSnapshot: state.nextSnapshot ?? undefined,
      dialogOpen: false,
    });
    // Even while closed, the resolved order keeps the captured prefix and
    // appends newcomers at the end.
    expect(state.orderedIds).toEqual(["a", "b", "c", "new1", "new2"]);

    // 4) reopen — visible order is prefix + appended newcomers, no shuffle.
    state = resolveInvoiceOrder({
      currentIds: ["a", "b", "new1", "c", "new2"],
      priorSnapshot: state.nextSnapshot ?? undefined,
      dialogOpen: true,
    });
    expect(state.orderedIds).toEqual(["a", "b", "c", "new1", "new2"]);
    expect(state.nextSnapshot).toEqual(["a", "b", "c", "new1", "new2"]);
  });

  it("subsequent refetch keeps newly appended ids pinned at the end", () => {
    // After reopen appended new1/new2, another refetch reorders again:
    const state = resolveInvoiceOrder({
      currentIds: ["new2", "a", "b", "new1", "c"],
      priorSnapshot: ["a", "b", "c", "new1", "new2"],
      dialogOpen: true,
    });
    expect(state.orderedIds).toEqual(["a", "b", "c", "new1", "new2"]);
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
