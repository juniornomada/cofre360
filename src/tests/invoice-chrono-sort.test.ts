import { describe, it, expect } from "vitest";
import {
  compareInvoiceChrono,
  sortInvoiceChronoAsc,
  type ChronoSortable,
} from "@/lib/invoice-chrono-sort";

/**
 * Garante que /cards exibe lançamentos do MAIS ANTIGO para o MAIS RECENTE,
 * usando parseTxDate como chave primária e (created_at, id) como
 * desempates estáveis.
 */

const tx = (
  id: string,
  date: string,
  created_at?: string | null,
): ChronoSortable => ({ id, date, created_at });

describe("Cards /cards — ordenação cronológica ascendente", () => {
  it("ordena por parseTxDate ascendente (mais antigo → mais recente)", () => {
    const list = [
      tx("c", "15/07", "2026-07-15T10:00:00Z"),
      tx("a", "01/07", "2026-07-01T10:00:00Z"),
      tx("b", "10/07", "2026-07-10T10:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("desempata por created_at quando parseTxDate coincide", () => {
    const list = [
      tx("late", "10/07", "2026-07-10T18:00:00Z"),
      tx("early", "10/07", "2026-07-10T09:00:00Z"),
      tx("mid", "10/07", "2026-07-10T12:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => t.id)).toEqual([
      "early",
      "mid",
      "late",
    ]);
  });

  it("desempata por id (localeCompare) quando date e created_at coincidem", () => {
    const list = [
      tx("zeta", "10/07", "2026-07-10T10:00:00Z"),
      tx("alpha", "10/07", "2026-07-10T10:00:00Z"),
      tx("mike", "10/07", "2026-07-10T10:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => t.id)).toEqual([
      "alpha",
      "mike",
      "zeta",
    ]);
  });

  it("mantém ordem determinística ao ordenar duas vezes (idempotente)", () => {
    const list = [
      tx("x", "12/07", "2026-07-12T08:00:00Z"),
      tx("y", "12/07", "2026-07-12T08:00:00Z"),
      tx("z", "05/07", "2026-07-05T08:00:00Z"),
      tx("w", "20/07", "2026-07-20T08:00:00Z"),
    ];
    const once = sortInvoiceChronoAsc(list).map((t) => t.id);
    const twice = sortInvoiceChronoAsc(sortInvoiceChronoAsc(list)).map(
      (t) => t.id,
    );
    expect(twice).toEqual(once);
  });

  it("não muta a lista original", () => {
    const list = [
      tx("b", "10/07", "2026-07-10T10:00:00Z"),
      tx("a", "01/07", "2026-07-01T10:00:00Z"),
    ];
    const snapshot = list.map((t) => t.id);
    sortInvoiceChronoAsc(list);
    expect(list.map((t) => t.id)).toEqual(snapshot);
  });

  it("comparator: sinais coerentes (<0, 0, >0)", () => {
    const a = tx("a", "01/07", "2026-07-01T10:00:00Z");
    const b = tx("b", "10/07", "2026-07-10T10:00:00Z");
    expect(compareInvoiceChrono(a, b)).toBeLessThan(0);
    expect(compareInvoiceChrono(b, a)).toBeGreaterThan(0);
    expect(compareInvoiceChrono(a, a)).toBe(0);
  });

  it("trata created_at ausente como 0 (fica antes de created_at posterior no mesmo dia)", () => {
    const list = [
      tx("with", "10/07", "2026-07-10T10:00:00Z"),
      tx("without", "10/07", null),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => t.id)).toEqual([
      "without",
      "with",
    ]);
  });

  it("respeita virada de ano via heurística Dez↔Jan de parseTxDate", () => {
    // "31/12" criado em janeiro deve ficar ANTES de "02/01" criado em janeiro:
    // parseTxDate atribui 2025-12-31 vs 2026-01-02.
    const list = [
      tx("jan02", "02/01", "2026-01-02T10:00:00Z"),
      tx("dec31", "31/12", "2026-01-01T10:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => t.id)).toEqual([
      "dec31",
      "jan02",
    ]);
  });

  it("cenário realista de fatura com múltiplas datas e desempates mistos", () => {
    const list = [
      tx("f", "18/07", "2026-07-18T09:00:00Z"),
      tx("b", "05/07", "2026-07-05T14:00:00Z"),
      tx("a", "05/07", "2026-07-05T09:00:00Z"),
      tx("e", "12/07", "2026-07-12T09:00:00Z"),
      tx("d", "12/07", "2026-07-12T09:00:00Z"), // mesmo instante que "e" → desempate por id
      tx("c", "10/07", "2026-07-10T09:00:00Z"),
    ];
    expect(sortInvoiceChronoAsc(list).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });
});

describe("Cards /cards — call site usa o helper canônico", () => {
  it("cards.tsx importa sortInvoiceChronoAsc e não reimplementa a ordenação inline", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "routes", "cards.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /from\s+["']@\/lib\/invoice-chrono-sort["']/,
    );
    expect(src).toMatch(/sortInvoiceChronoAsc\s*\(/);
    // Não pode ter comparador inline duplicado sobre parseTxDate no arquivo.
    expect(src).not.toMatch(
      /\.sort\(\s*\(\s*a\s*,\s*b\s*\)\s*=>\s*\{[^}]*parseTxDate\(a\.date/,
    );
  });
});
