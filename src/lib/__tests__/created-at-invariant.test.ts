import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeCreatedAt,
  isIsoCreatedAt,
  auditCreatedAtBatch,
  CreatedAtInvariantError,
} from "../created-at-invariant";

/**
 * Contrato:
 *  - `created_at` deve ser um ISO 8601 válido ou vazio (null/undefined/"").
 *  - Qualquer outra string — em especial os formatos textuais aceitos
 *    por `parseTxDate` no campo `date` ("10 jul", "31 dez",
 *    "10/07/2025", "sem data") — é violação.
 *
 * Se alguém, no futuro, escrever `created_at: t.date` (a regressão
 * exata que já contaminou ciclos de fatura na virada de ano), estes
 * testes falham imediatamente.
 */

const FIXED_NOW = new Date("2026-07-15T12:00:00Z");

describe("isIsoCreatedAt", () => {
  it.each([
    "2025-07-10T13:00:00Z",
    "2025-07-10T13:00:00.123Z",
    "2025-07-10T13:00:00+00:00",
    "2025-07-10T13:00:00-03:00",
    "2025-07-10",
    "2025-12-31T23:59:59.999Z",
  ])("aceita ISO válido: %s", (iso) => {
    expect(isIsoCreatedAt(iso)).toBe(true);
  });

  it.each([
    // exatamente os formatos que `parseTxDate` aceita no campo `date`
    "10 jul",
    "31 dez",
    "10 jul 2025",
    "10/07",
    "10/07/2025",
    "10-07-2025",
    "07-10", // MM-DD ambíguo
    "December 31, 2025",
    "dez",
    "jul",
    "sem data",
    "hoje",
    "ontem",
    "amanhã",
    "Invalid Date",
    "NaN",
    "",
    "   ",
    "10jul2025",
    "2025/07/10", // barras não-ISO
    "20250710",   // compacto sem separadores
    "2025-13-01", // mês inválido — Date.parse retorna NaN
  ])("rejeita não-ISO / date textual: %s", (bad) => {
    expect(isIsoCreatedAt(bad)).toBe(false);
  });

  it.each([null, undefined, 12345, {}, [], true, false, NaN])(
    "rejeita não-string: %s",
    (v) => {
      expect(isIsoCreatedAt(v)).toBe(false);
    },
  );
});

describe("sanitizeCreatedAt — inputs válidos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("mantém ISO canônico inalterado", () => {
    const out = sanitizeCreatedAt("2025-07-10T13:00:00.000Z", { context: "t" });
    expect(out).toBe("2025-07-10T13:00:00.000Z");
  });

  it("normaliza offsets para UTC", () => {
    const out = sanitizeCreatedAt("2025-07-10T10:00:00-03:00", { context: "t" });
    expect(out).toBe("2025-07-10T13:00:00.000Z");
  });

  it.each([null, undefined, "", "   "])(
    "usa fallback new Date() para vazio (%s)",
    (v) => {
      const out = sanitizeCreatedAt(v as any, { context: "t" });
      expect(out).toBe(FIXED_NOW.toISOString());
    },
  );

  it("respeita a fábrica `now` injetada", () => {
    const custom = new Date("2030-01-01T00:00:00Z");
    const out = sanitizeCreatedAt(null, {
      context: "t",
      now: () => custom,
    });
    expect(out).toBe(custom.toISOString());
  });
});

describe("sanitizeCreatedAt — violação de invariante (regressão: date → created_at)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => vi.useRealTimers());

  const DATE_TEXTUAL_LEAK_CASES = [
    "10 jul",
    "31 dez",
    "10/07/2025",
    "December 31, 2025",
    "sem data",
    "hoje",
  ];

  it.each(DATE_TEXTUAL_LEAK_CASES)(
    'onViolation="throw" (default fora de produção): "%s" lança',
    (leak) => {
      expect(() =>
        sanitizeCreatedAt(leak, { context: "index.tsx:txsByName" }),
      ).toThrow(CreatedAtInvariantError);
    },
  );

  it.each(DATE_TEXTUAL_LEAK_CASES)(
    'onViolation="warn": "%s" registra warn e cai para "agora"',
    (leak) => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const out = sanitizeCreatedAt(leak, {
        context: "index.tsx:txsByName",
        onViolation: "warn",
      });
      expect(out).toBe(FIXED_NOW.toISOString());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("[created-at-invariant]");
      expect(spy.mock.calls[0][0]).toContain("index.tsx:txsByName");
      spy.mockRestore();
    },
  );

  it('onViolation="silent" retorna fallback sem log', () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = sanitizeCreatedAt("10 jul", {
      context: "t",
      onViolation: "silent",
    });
    expect(out).toBe(FIXED_NOW.toISOString());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("mensagem de erro inclui o valor recebido e o contexto", () => {
    try {
      sanitizeCreatedAt("31 dez", { context: "index.tsx:formattedTxs" });
      throw new Error("deveria ter lançado");
    } catch (e) {
      expect(e).toBeInstanceOf(CreatedAtInvariantError);
      const err = e as CreatedAtInvariantError;
      expect(err.received).toBe("31 dez");
      expect(err.context).toBe("index.tsx:formattedTxs");
      expect(err.message).toContain('"31 dez"');
      expect(err.message).toContain("index.tsx:formattedTxs");
      expect(err.message).toMatch(/campo "date" textual/);
    }
  });
});

describe("auditCreatedAtBatch — audita mapeamentos do loader da Home", () => {
  it("retorna vazio quando todos os created_at são ISO ou vazios", () => {
    const rows = [
      { created_at: "2025-07-10T13:00:00Z" },
      { created_at: null },
      { created_at: undefined },
      { created_at: "" },
      { created_at: "2025-12-31T23:59:59.999Z" },
    ];
    expect(auditCreatedAtBatch(rows)).toEqual([]);
  });

  it("detecta uma linha com date textual promovida a created_at", () => {
    const rows = [
      { created_at: "2025-07-10T13:00:00Z" },
      { created_at: "10 jul" }, // <-- regressão
      { created_at: "2025-12-31T23:59:59.999Z" },
    ];
    const errors = auditCreatedAtBatch(rows);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(CreatedAtInvariantError);
    expect(errors[0].context).toBe("row[1].created_at");
    expect(errors[0].received).toBe("10 jul");
  });

  it("aceita campo customizado (ex.: paid_at)", () => {
    const rows = [{ paid_at: "not-iso" }, { paid_at: "2025-07-10T13:00:00Z" }];
    const errors = auditCreatedAtBatch(rows, "paid_at");
    expect(errors).toHaveLength(1);
    expect(errors[0].context).toBe("row[0].paid_at");
  });

  it("simula o mapper exato do loader da Home: promover `date` a `created_at` DEVE ser flagrado", () => {
    // Espelha o shape produzido em src/routes/index.tsx (formattedTxs).
    // A regressão ocorreria se alguém escrevesse:
    //   created_at: (t as any).created_at || t.date
    // em vez de `|| new Date().toISOString()`.
    const supabaseRows: Array<{ date: string; created_at: string | null }> = [
      { date: "10 jul",  created_at: "2025-07-10T13:00:00Z" }, // OK: usa created_at
      { date: "31 dez",  created_at: null },                    // OK: cai para "agora"
      { date: "sem data", created_at: null },
    ];

    const okMapper = (rows: typeof supabaseRows) =>
      rows.map((t) => ({
        created_at: sanitizeCreatedAt(t.created_at, {
          context: "test:ok",
          onViolation: "throw",
        }),
      }));

    const brokenMapper = (rows: typeof supabaseRows) =>
      rows.map((t) => ({
        // BUG: fallback promove `date` textual a `created_at`.
        created_at: sanitizeCreatedAt(t.created_at ?? t.date, {
          context: "test:broken",
          onViolation: "throw",
        }),
      }));

    expect(() => okMapper(supabaseRows)).not.toThrow();
    expect(() => brokenMapper(supabaseRows)).toThrow(CreatedAtInvariantError);
  });
});
