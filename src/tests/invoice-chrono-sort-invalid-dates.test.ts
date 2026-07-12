import { describe, it, expect } from "vitest";
import {
  compareInvoiceChrono,
  sortInvoiceChronoAsc,
  invoiceChronoKey,
  type ChronoSortable,
} from "@/lib/invoice-chrono-sort";

/**
 * Robustez do comparador: lançamentos com `date` inválido/indefinido não
 * podem quebrar a UI da fatura, embaralhar entre refetches, nem lançar.
 */

const tx = (
  id: string,
  date: string | null | undefined,
  created_at?: string | null,
): ChronoSortable => ({ id, date, created_at });

describe("Cards /cards — parseTxDate indefinido/inválido não quebra a ordenação", () => {
  it("date válido tem prioridade e continua ordenando cronologicamente", () => {
    const list = [
      tx("b", "10/07", "2026-07-10T09:00:00Z"),
      tx("a", "01/07", "2026-07-01T09:00:00Z"),
      tx("c", "20/07", "2026-07-20T09:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => String(t.id))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("date ausente/indefinido: item ancora em created_at (ISO válido)", () => {
    const list = [
      tx("late", null, "2026-07-20T09:00:00Z"),
      tx("early", undefined, "2026-07-01T09:00:00Z"),
      tx("mid", "", "2026-07-10T09:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => String(t.id))).toEqual([
      "early",
      "mid",
      "late",
    ]);
  });

  it("mistura: itens com date válido ficam antes de itens só-com-created_at do mesmo dia", () => {
    // "10/07" via parseTxDate assume created_at como ano; ambos batem em
    // 2026-07-10. O item com date explícito tem parseTxDate exato (00:00 UTC),
    // o item só-com-created_at ancora no horário real (09:00). Ordem: date
    // primeiro (mais cedo), depois created_at.
    const list = [
      tx("only-ca", null, "2026-07-10T09:00:00Z"),
      tx("with-date", "10/07", "2026-07-10T09:00:00Z"),
    ];
    const ids = sortInvoiceChronoAsc(list).map((t) => String(t.id));
    expect(ids).toEqual(["with-date", "only-ca"]);
  });

  it("date inválido ('lixo') com created_at válido: ancora em created_at", () => {
    const list = [
      tx("garbage-late", "not-a-date", "2026-07-20T09:00:00Z"),
      tx("valid-early", "01/07", "2026-07-01T09:00:00Z"),
      tx("garbage-early", "??/??", "2026-07-05T09:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => String(t.id))).toEqual([
      "valid-early",
      "garbage-early",
      "garbage-late",
    ]);
  });

  it("date e created_at ambos inválidos: afunda para o final, desempate por id", () => {
    const list = [
      tx("valid", "10/07", "2026-07-10T09:00:00Z"),
      tx("bad-z", null, null),
      tx("bad-a", "", "not-iso"),
      tx("bad-m", "??", undefined),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => String(t.id))).toEqual([
      "valid",
      "bad-a",
      "bad-m",
      "bad-z",
    ]);
  });

  it("ordem é idempotente com itens inválidos misturados (não flutua entre refetches)", () => {
    const list = [
      tx("v2", "12/07", "2026-07-12T09:00:00Z"),
      tx("bad-y", null, null),
      tx("v1", "05/07", "2026-07-05T09:00:00Z"),
      tx("bad-x", "lixo", "não-iso"),
    ];
    const once = sortInvoiceChronoAsc(list).map((t) => String(t.id));
    const twice = sortInvoiceChronoAsc(sortInvoiceChronoAsc(list)).map((t) =>
      String(t.id),
    );
    expect(twice).toEqual(once);
    // Rodar em intervalos separados deve dar o mesmo resultado — sem
    // dependência do relógio.
    const later = sortInvoiceChronoAsc(list).map((t) => String(t.id));
    expect(later).toEqual(once);
  });

  it("comparador nunca lança e sempre retorna número finito quando inputs são finitos", () => {
    const samples: ChronoSortable[] = [
      tx("a", "10/07", "2026-07-10T09:00:00Z"),
      tx("b", null, "2026-07-01T09:00:00Z"),
      tx("c", "lixo", null),
      tx("d", "", undefined),
    ];
    for (const a of samples) {
      for (const b of samples) {
        expect(() => compareInvoiceChrono(a, b)).not.toThrow();
        const v = compareInvoiceChrono(a, b);
        expect(Number.isNaN(v)).toBe(false);
      }
    }
  });

  it("invoiceChronoKey retorna +Infinity apenas quando não há sinal temporal confiável", () => {
    expect(invoiceChronoKey(tx("x", "10/07", "2026-07-10T09:00:00Z"))).toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
    expect(invoiceChronoKey(tx("x", null, "2026-07-10T09:00:00Z"))).toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
    expect(invoiceChronoKey(tx("x", "lixo", "2026-07-10T09:00:00Z"))).toBeLessThan(
      Number.POSITIVE_INFINITY,
    );
    expect(invoiceChronoKey(tx("x", null, null))).toBe(Number.POSITIVE_INFINITY);
    expect(invoiceChronoKey(tx("x", "", "não-iso"))).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("não muta a lista original mesmo quando há itens inválidos", () => {
    const list: ChronoSortable[] = [
      tx("bad", null, null),
      tx("good", "10/07", "2026-07-10T09:00:00Z"),
    ];
    const before = list.map((t) => String(t.id));
    sortInvoiceChronoAsc(list);
    expect(list.map((t) => String(t.id))).toEqual(before);
  });
});
