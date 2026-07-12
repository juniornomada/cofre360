import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordLegacyLabelDetection,
  getLegacyLabelEvents,
  subscribeLegacyLabelEvents,
  clearLegacyLabelEvents,
} from "@/lib/legacy-label-telemetry";

describe("legacy-label-telemetry", () => {
  beforeEach(() => {
    clearLegacyLabelEvents();
  });

  it("registra uma detecção com timestamp ISO, raw, canonical, source e context", () => {
    recordLegacyLabelDetection({
      raw: "Pagamento Parcial fatura cartão Porto Bank",
      canonical: "Pagamento Parcial cartão Porto Bank",
      source: "/cards:invoice-dialog",
      context: { cardId: "c1", period: "2026-04" },
    });
    const events = getLegacyLabelEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      raw: "Pagamento Parcial fatura cartão Porto Bank",
      canonical: "Pagamento Parcial cartão Porto Bank",
      source: "/cards:invoice-dialog",
      context: { cardId: "c1", period: "2026-04" },
    });
    expect(events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("mantém ordem de inserção (mais antigo → mais recente)", () => {
    for (let i = 0; i < 3; i++) {
      recordLegacyLabelDetection({
        raw: `raw ${i}`,
        canonical: `canonical ${i}`,
        source: "test",
      });
    }
    const raws = getLegacyLabelEvents().map((e) => e.raw);
    expect(raws).toEqual(["raw 0", "raw 1", "raw 2"]);
  });

  it("aplica ring-buffer com teto de 200 eventos", () => {
    for (let i = 0; i < 250; i++) {
      recordLegacyLabelDetection({ raw: `r${i}`, canonical: `c${i}`, source: "t" });
    }
    const events = getLegacyLabelEvents();
    expect(events).toHaveLength(200);
    // O mais antigo agora deve ser o de índice 50 (250 - 200).
    expect(events[0].raw).toBe("r50");
    expect(events[199].raw).toBe("r249");
  });

  it("notifica assinantes de forma síncrona e o unsubscribe funciona", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLegacyLabelEvents(listener);
    recordLegacyLabelDetection({ raw: "a", canonical: "b", source: "s" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ raw: "a", canonical: "b" });
    unsubscribe();
    recordLegacyLabelDetection({ raw: "c", canonical: "d", source: "s" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("um listener que lança não impede outros listeners nem a gravação", () => {
    const good = vi.fn();
    subscribeLegacyLabelEvents(() => {
      throw new Error("boom");
    });
    subscribeLegacyLabelEvents(good);
    expect(() =>
      recordLegacyLabelDetection({ raw: "x", canonical: "y", source: "s" }),
    ).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(getLegacyLabelEvents()).toHaveLength(1);
  });

  it("clearLegacyLabelEvents esvazia o buffer", () => {
    recordLegacyLabelDetection({ raw: "a", canonical: "b", source: "s" });
    expect(getLegacyLabelEvents()).toHaveLength(1);
    clearLegacyLabelEvents();
    expect(getLegacyLabelEvents()).toEqual([]);
  });

  it("snapshot é uma cópia — mutar o array retornado não altera o buffer interno", () => {
    recordLegacyLabelDetection({ raw: "a", canonical: "b", source: "s" });
    const snap = getLegacyLabelEvents();
    snap.push({
      at: "1970-01-01T00:00:00.000Z",
      raw: "hack",
      canonical: "hack",
      source: "hack",
    });
    expect(getLegacyLabelEvents()).toHaveLength(1);
  });
});
