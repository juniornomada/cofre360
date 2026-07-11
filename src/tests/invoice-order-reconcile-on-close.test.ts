import { describe, it, expect } from "vitest";
import { reconcileSnapshotOnClose } from "@/lib/invoice-order-snapshot";

describe("reconcileSnapshotOnClose", () => {
  it("removes ids no longer present while preserving captured order", () => {
    const snaps = new Map<string, string[]>([["k1", ["a", "b", "c", "d"]]]);
    reconcileSnapshotOnClose(snaps, { k1: ["c", "a", "d"] });
    expect(snaps.get("k1")).toEqual(["a", "c", "d"]);
  });

  it("deletes empty buckets after pruning", () => {
    const snaps = new Map<string, string[]>([["k1", ["a", "b"]]]);
    reconcileSnapshotOnClose(snaps, { k1: [] });
    expect(snaps.has("k1")).toBe(false);
  });

  it("leaves untouched buckets we cannot observe", () => {
    const snaps = new Map<string, string[]>([
      ["k1", ["a", "b"]],
      ["k2", ["x", "y"]],
    ]);
    reconcileSnapshotOnClose(snaps, { k1: ["a"] });
    expect(snaps.get("k1")).toEqual(["a"]);
    expect(snaps.get("k2")).toEqual(["x", "y"]);
  });

  it("is a no-op when snapshot equals current ids", () => {
    const snaps = new Map<string, string[]>([["k1", ["a", "b"]]]);
    const before = snaps.get("k1");
    reconcileSnapshotOnClose(snaps, { k1: ["a", "b"] });
    // same reference preserved when no change is needed
    expect(snaps.get("k1")).toBe(before);
  });

  it("reconciles multiple buckets independently", () => {
    const snaps = new Map<string, string[]>([
      ["k1", ["a", "b", "c"]],
      ["k2", ["x", "y"]],
      ["k3", ["m"]],
    ]);
    reconcileSnapshotOnClose(snaps, {
      k1: ["a", "c"],
      k2: ["x", "y", "z"],
      k3: [],
    });
    expect(snaps.get("k1")).toEqual(["a", "c"]);
    expect(snaps.get("k2")).toEqual(["x", "y"]); // newcomer 'z' NOT added here
    expect(snaps.has("k3")).toBe(false);
  });

  it("is idempotent when applied twice in a row", () => {
    const snaps = new Map<string, string[]>([["k1", ["a", "b", "c"]]]);
    reconcileSnapshotOnClose(snaps, { k1: ["a", "c"] });
    const first = snaps.get("k1")!.slice();
    reconcileSnapshotOnClose(snaps, { k1: ["a", "c"] });
    expect(snaps.get("k1")).toEqual(first);
  });
});
