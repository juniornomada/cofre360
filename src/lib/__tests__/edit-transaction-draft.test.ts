import { describe, it, expect, beforeEach } from "vitest";
import {
  loadEditDraft,
  saveEditDraft,
  clearEditDraft,
  clearAllEditDrafts,
} from "@/lib/edit-transaction-draft";

beforeEach(() => {
  window.localStorage.clear();
});

describe("edit-transaction-draft", () => {
  it("returns null when no draft exists", () => {
    expect(loadEditDraft("tx-1")).toBeNull();
  });

  it("saves and restores a draft with mode + fields", () => {
    saveEditDraft("tx-1", {
      fields: { amount: 123.45, total_installments: 3, category: "Alimentação" },
      mode: "fixed",
    });
    const d = loadEditDraft("tx-1");
    expect(d).not.toBeNull();
    expect(d!.mode).toBe("fixed");
    expect(d!.fields.amount).toBe(123.45);
    expect(d!.fields.total_installments).toBe(3);
    expect(d!.fields.category).toBe("Alimentação");
    expect(typeof d!.savedAt).toBe("number");
  });

  it("isolates drafts per transaction id", () => {
    saveEditDraft("a", { fields: { amount: 10 }, mode: "divide" });
    saveEditDraft("b", { fields: { amount: 20 }, mode: "fixed" });
    expect(loadEditDraft("a")!.fields.amount).toBe(10);
    expect(loadEditDraft("b")!.fields.amount).toBe(20);
  });

  it("clears a specific draft", () => {
    saveEditDraft("a", { fields: { amount: 10 }, mode: "divide" });
    saveEditDraft("b", { fields: { amount: 20 }, mode: "fixed" });
    clearEditDraft("a");
    expect(loadEditDraft("a")).toBeNull();
    expect(loadEditDraft("b")).not.toBeNull();
  });

  it("expires drafts older than the TTL", () => {
    saveEditDraft("old", { fields: { amount: 5 }, mode: "divide" }, 1_000);
    // Rewrite the savedAt to be in the past
    const raw = JSON.parse(window.localStorage.getItem("edit-tx-drafts:v1")!);
    raw.old.savedAt = Date.now() - 10_000;
    window.localStorage.setItem("edit-tx-drafts:v1", JSON.stringify(raw));
    expect(loadEditDraft("old", 1_000)).toBeNull();
  });

  it("survives corrupted localStorage payloads", () => {
    window.localStorage.setItem("edit-tx-drafts:v1", "{not json");
    expect(loadEditDraft("x")).toBeNull();
    // Save still works after corruption
    saveEditDraft("x", { fields: { amount: 1 }, mode: "divide" });
    expect(loadEditDraft("x")!.fields.amount).toBe(1);
  });

  it("clearAllEditDrafts wipes storage", () => {
    saveEditDraft("a", { fields: { amount: 1 }, mode: "divide" });
    clearAllEditDrafts();
    expect(loadEditDraft("a")).toBeNull();
  });
});
