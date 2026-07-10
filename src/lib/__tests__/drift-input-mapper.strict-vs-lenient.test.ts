/**
 * Estrito vs. leniente: a normalização do mapper `toDriftInput` deve ser
 * INVARIANTE ao "enriquecimento futuro" da resposta.
 *
 * Contexto — dois consumidores do mesmo payload:
 *   • Parser ESTRITO (`.strict()`) — usado por clientes que já conhecem
 *     todos os campos e querem falhar cedo em drift de schema.
 *   • Parser LENIENTE (`.passthrough()`) — usado por clientes V1/V2 antigos
 *     que precisam tolerar campos V3+ ainda desconhecidos (forward-compat).
 *
 * Este teste garante que, sobre uma resposta ENRIQUECIDA com metadados
 * futuros (nas parcelas, no envelope de drift e no root):
 *   1. O parser ESTRITO só passa DEPOIS do mapper (que remove extras).
 *      Isso prova que o mapper é a superfície de normalização.
 *   2. O parser LENIENTE passa tanto no raw quanto no normalizado.
 *   3. A saída econômica do mapper (installments + drift) é IDÊNTICA nos
 *      dois cenários (com e sem enriquecimento) — nenhum campo obrigatório
 *      se perde, nenhum valor muda por causa dos campos extras.
 *   4. As invariantes R1..R6 (numeração, modo, drift ≤ N¢) permanecem.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  toDriftInput,
  type RawDriftBody,
  type DriftAssertInput,
} from "@/lib/drift-input-mapper";

// ---------------- Schemas ESTRITOS ----------------

const InstallmentStrictZ = z
  .object({
    installment_number: z.number().int().positive(),
    total_installments: z.number().int().positive(),
    amount: z.number().finite().nonnegative(),
    installment_source_amount: z.number().finite().nonnegative(),
    installment_mode: z.enum(["divide", "fixed"]),
  })
  .strict();

const DriftStrictZ = z
  .object({
    sum: z.number(),
    source: z.number(),
    delta: z.number().nonnegative(),
    tolerance: z.number().nonnegative(),
    ok: z.boolean(),
  })
  .strict();

const ResponseStrictZ = z
  .object({
    data: z
      .object({
        installments: z.array(InstallmentStrictZ).min(1),
        drift: DriftStrictZ.optional(),
      })
      .strict(),
  })
  .strict();

// ---------------- Schemas LENIENTES (V1/V2 forward-compat) ----------------

const InstallmentLenientZ = InstallmentStrictZ.passthrough();
const DriftLenientZ = DriftStrictZ.passthrough();

const ResponseLenientZ = z
  .object({
    data: z
      .object({
        installments: z.array(InstallmentLenientZ).min(1),
        drift: DriftLenientZ.optional(),
      })
      .passthrough(),
  })
  .passthrough();

// ---------------- Helpers ----------------

const round2 = (n: number) => Math.round(n * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);

/** Projeta a saída do mapper em uma forma canônica para comparação
 *  estrutural exata entre os dois cenários. */
function economicShape(out: DriftAssertInput) {
  return {
    installments: out.data.installments.map((r) => ({
      installment_number: r.installment_number,
      total_installments: r.total_installments,
      amount: r.amount,
      installment_source_amount: r.installment_source_amount,
      installment_mode: r.installment_mode,
    })),
    drift: out.data.drift
      ? {
          sum: out.data.drift.sum,
          source: out.data.drift.source,
          delta: out.data.drift.delta,
          tolerance: out.data.drift.tolerance,
          ok: out.data.drift.ok,
        }
      : undefined,
  };
}

// ---------------- Fixtures ----------------

const BASE: RawDriftBody = {
  data: {
    installments: [
      {
        installment_number: 1,
        total_installments: 3,
        amount: 33.34,
        installment_source_amount: 100,
        installment_mode: "divide",
      },
      {
        installment_number: 2,
        total_installments: 3,
        amount: 33.33,
        installment_source_amount: 100,
        installment_mode: "divide",
      },
      {
        installment_number: 3,
        total_installments: 3,
        amount: 33.33,
        installment_source_amount: 100,
        installment_mode: "divide",
      },
    ],
    drift: { sum: 100, source: 100, delta: 0, tolerance: 0.03, ok: true },
  },
};

/** Constrói uma versão da BASE enriquecida com campos futuros em três
 *  níveis: raiz, envelope `data.drift`, e cada linha de installments. */
function enrich(base: RawDriftBody): RawDriftBody {
  const rows = (base.data?.installments ?? []).map((r, i) => ({
    ...r,
    // metadados por-parcela futuros
    server_generated_at: `2026-07-10T12:00:0${i}.000Z`,
    rounding_policy: "half-away-from-zero",
    currency_code: "BRL",
    audit_trail_id: `at_${i}`,
    ledger_ref: { book: "cc-main", line: 40 + i },
    feature_flag: ["exp.rounding-v3"],
    // colisão de nome em subestrutura — não pode influenciar o mapper
    extras: { installment_number: 999, amount: -1 },
  }));
  return {
    // metadados no root
    request_id: "req_xyz",
    trace_id: "tr_abc",
    schema_version: "3",
    data: {
      installments: rows,
      drift: {
        ...(base.data?.drift ?? {}),
        model_version: "drift-v3",
        computed_by: "worker@edge",
        confidence: 0.99,
      },
      // metadados no envelope data
      audit: { by: "system", at: "2026-07-10T12:00:00Z" },
    },
  };
}

// ---------------- Testes ----------------

describe("normalização invariante: parser estrito vs. leniente", () => {
  it("mapper remove extras: estrito falha no RAW enriquecido e passa no NORMALIZADO", () => {
    const enriched = enrich(BASE);

    // (1) Estrito NÃO aceita o raw enriquecido — há chaves além do contrato.
    expect(() => ResponseStrictZ.parse(enriched)).toThrow();

    // (2) Depois do mapper, estrito aceita — o mapper é a normalização.
    const normalized = toDriftInput(enriched);
    expect(() => ResponseStrictZ.parse(normalized)).not.toThrow();
  });

  it("leniente aceita RAW e NORMALIZADO igualmente (forward-compat V1/V2)", () => {
    const enriched = enrich(BASE);
    expect(() => ResponseLenientZ.parse(enriched)).not.toThrow();

    const normalized = toDriftInput(enriched);
    expect(() => ResponseLenientZ.parse(normalized)).not.toThrow();
  });

  it("saída econômica é IDÊNTICA com e sem enriquecimento futuro", () => {
    const baseOut = toDriftInput(BASE);
    const enrichedOut = toDriftInput(enrich(BASE));

    // Igualdade estrutural profunda das cinco chaves por parcela + drift.
    expect(economicShape(enrichedOut)).toEqual(economicShape(baseOut));
  });

  it("nenhum campo extra vazou pela normalização (root, drift, parcelas)", () => {
    const normalized = toDriftInput(enrich(BASE));

    // Root: apenas `data`.
    expect(Object.keys(normalized).sort()).toEqual(["data"]);
    // Data: apenas `installments` e `drift`.
    expect(Object.keys(normalized.data).sort()).toEqual(["drift", "installments"]);
    // Cada parcela: exatamente os 5 campos do contrato.
    for (const r of normalized.data.installments) {
      expect(Object.keys(r).sort()).toEqual(
        [
          "amount",
          "installment_mode",
          "installment_number",
          "installment_source_amount",
          "total_installments",
        ],
      );
    }
    // Drift: exatamente os 5 campos regulamentares.
    expect(Object.keys(normalized.data.drift!).sort()).toEqual(
      ["delta", "ok", "source", "sum", "tolerance"],
    );
  });

  it("R1..R6 permanecem válidas após passar por qualquer um dos parsers", () => {
    const normalized = toDriftInput(enrich(BASE));

    const strict = ResponseStrictZ.parse(normalized);
    const lenient = ResponseLenientZ.parse(normalized);

    for (const parsed of [strict, lenient]) {
      const N = parsed.data.installments.length;
      // R1
      for (const r of parsed.data.installments) expect(r.total_installments).toBe(N);
      // R2
      const nums = parsed.data.installments.map((r) => r.installment_number).sort((a, b) => a - b);
      expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
      // R3
      for (const r of parsed.data.installments) expect(round2(r.amount)).toBe(r.amount);
      // R4
      const mode = parsed.data.installments[0].installment_mode;
      for (const r of parsed.data.installments) expect(r.installment_mode).toBe(mode);
      // R5
      const src = parsed.data.installments[0].installment_source_amount;
      const sumC = parsed.data.installments.reduce((s, r) => s + toCents(r.amount), 0);
      expect(Math.abs(sumC - toCents(src))).toBeLessThanOrEqual(N);
      // R6
      if (parsed.data.drift) {
        expect(parsed.data.drift.tolerance).toBe(round2(N * 0.01));
        expect(parsed.data.drift.ok).toBe(true);
        expect(toCents(parsed.data.drift.sum)).toBe(sumC);
      }
    }
  });

  it("idempotência: enriquecer duas vezes com dados distintos não muda o normalizado", () => {
    // Segundo enriquecimento com valores diferentes nos campos futuros.
    const twice = enrich({
      data: {
        installments: (enrich(BASE).data?.installments ?? []).map((r) => ({
          ...r,
          server_generated_at: "9999-01-01T00:00:00.000Z",
          audit_trail_id: "at_OVERWRITTEN",
        })),
        drift: { ...(enrich(BASE).data?.drift ?? {}), model_version: "drift-v99" },
      },
    });

    expect(economicShape(toDriftInput(twice))).toEqual(economicShape(toDriftInput(BASE)));
  });
});
