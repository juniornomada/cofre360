/**
 * Validação de runtime (Zod) sobre a saída do mapper `toDriftInput`.
 *
 * As mudanças de tipagem estática (`InstallmentPreview`, `DriftMetric`,
 * `DriftAssertInput`) evitam regressões *em tempo de compilação*, mas não
 * capturam:
 *   - Um campo que passe a chegar como `string` em vez de `number` de um
 *     parser upstream com `.passthrough()` mal configurado.
 *   - Perda silenciosa de chave obrigatória via spread/merge em refactor.
 *   - Drift internamente inconsistente (ex.: `delta !== |sum − source|`, ou
 *     `tolerance !== N × 0.01`, ou `ok` divergindo de `delta ≤ tolerance`).
 *
 * Este arquivo define schemas Zod estritos e valida a saída do mapper para
 * várias formas de entrada, incluindo casos-limite. Se algum contrato de
 * tipagem for afrouxado em refactor, esses testes falham antes do merge.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  toDriftInput,
  type RawDriftBody,
  type RawInstallmentRow,
} from "@/lib/drift-input-mapper";

// ---------------- Schemas estritos ----------------

const InstallmentPreviewZ = z
  .object({
    installment_number: z.number().int().positive(),
    total_installments: z.number().int().positive(),
    amount: z.number().finite().nonnegative(),
    installment_source_amount: z.number().finite().nonnegative(),
    installment_mode: z.enum(["divide", "fixed"]),
  })
  .strict();

const DriftMetricZ = z
  .object({
    sum: z.number().finite(),
    source: z.number().finite(),
    delta: z.number().finite().nonnegative(),
    tolerance: z.number().finite().nonnegative(),
    ok: z.boolean(),
  })
  .strict();

const DriftAssertInputZ = z
  .object({
    data: z
      .object({
        installments: z.array(InstallmentPreviewZ),
        drift: DriftMetricZ.optional(),
      })
      .strict(),
  })
  .strict();

// ---------------- Helpers ----------------

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

const row = (
  n: number,
  total: number,
  amount: number,
  source: number,
  mode: "divide" | "fixed" = "divide",
  extras: Record<string, unknown> = {},
): RawInstallmentRow => ({
  installment_number: n,
  total_installments: total,
  amount,
  installment_source_amount: source,
  installment_mode: mode,
  ...extras,
});

/** Regras internas de coerência drift↔installments (R1..R6 condensadas). */
function assertCoherent(out: z.infer<typeof DriftAssertInputZ>) {
  const { installments, drift } = out.data;
  const N = installments.length;
  if (N === 0) {
    expect(drift).toBeUndefined();
    return;
  }
  // R1: total_installments === N em toda linha
  for (const r of installments) expect(r.total_installments).toBe(N);
  // R2: numeração 1..N contígua
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  // R3: ≤ 2 casas decimais
  for (const r of installments) expect(round2(r.amount)).toBe(r.amount);
  // R4: modo homogêneo
  const mode = installments[0].installment_mode;
  for (const r of installments) expect(r.installment_mode).toBe(mode);
  // R5: drift regulamentar em centavos
  const source = installments[0].installment_source_amount;
  const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(Math.abs(sumCents - toCents(source))).toBeLessThanOrEqual(N);
  // R6: coerência interna do drift quando presente
  if (drift) {
    expect(toCents(drift.sum)).toBe(sumCents);
    expect(toCents(drift.source)).toBe(toCents(source));
    expect(round2(drift.delta)).toBe(round2(Math.abs(drift.sum - drift.source)));
    expect(drift.tolerance).toBe(round2(N * 0.01));
    expect(drift.ok).toBe(drift.delta <= drift.tolerance + 1e-9);
  }
}

// ---------------- Casos ----------------

const CASES: ReadonlyArray<{
  name: string;
  body: RawDriftBody;
  expectDrift: boolean;
}> = [
  {
    name: "1 parcela divide sem drift",
    body: { data: { installments: [row(1, 1, 10, 10)] } },
    expectDrift: false,
  },
  {
    name: "3 parcelas com resíduo distribuído + drift ok",
    body: {
      data: {
        installments: [row(1, 3, 33.34, 100), row(2, 3, 33.33, 100), row(3, 3, 33.33, 100)],
        drift: { sum: 100, source: 100, delta: 0, tolerance: 0.03, ok: true },
      },
    },
    expectDrift: true,
  },
  {
    name: "modo fixed uniforme + drift no limite (≤ N¢)",
    body: {
      data: {
        installments: [row(1, 4, 25, 100, "fixed"), row(2, 4, 25, 100, "fixed"),
                       row(3, 4, 25, 100, "fixed"), row(4, 4, 25, 100, "fixed")],
        drift: { sum: 100, source: 100, delta: 0, tolerance: 0.04, ok: true },
      },
    },
    expectDrift: true,
  },
  {
    name: "N=360 (limite alto do produto)",
    body: {
      data: {
        installments: Array.from({ length: 360 }, (_, i) =>
          row(i + 1, 360, 2.78, 1000.8, "divide"),
        ),
        drift: {
          sum: round2(360 * 2.78),
          source: 1000.8,
          delta: round2(Math.abs(360 * 2.78 - 1000.8)),
          tolerance: round2(360 * 0.01),
          ok: true,
        },
      },
    },
    expectDrift: true,
  },
  {
    name: "installments vazio → drift undefined",
    body: { data: { installments: [] } },
    expectDrift: false,
  },
];

// ---------------- Testes ----------------

describe("toDriftInput — validação de runtime com Zod (anti-regressão)", () => {
  it.each(CASES)("R1..R6 + shape Zod estrito: $name", ({ body, expectDrift }) => {
    const out = toDriftInput(body);
    // 1) O schema estrito rejeita chaves extras e tipos frouxos.
    const parsed = DriftAssertInputZ.parse(out);
    // 2) Coerência interna drift↔installments.
    assertCoherent(parsed);
    // 3) Presença/ausência do drift conforme esperado.
    expect(parsed.data.drift !== undefined).toBe(expectDrift);
  });

  it("rejeita chaves extras nas parcelas (guarda contra .passthrough() leak)", () => {
    const contaminated = {
      data: {
        installments: [
          { ...row(1, 1, 10, 10), server_metadata: "x" as unknown as never },
        ],
      },
    };
    // O mapper já descarta extras; se um refactor futuro removê-lo, o
    // schema `.strict()` acusa antes do merge.
    const out = toDriftInput(contaminated);
    expect(() => DriftAssertInputZ.parse(out)).not.toThrow();
    // E o objeto de saída NÃO carrega a chave estranha.
    const probe = out.data.installments[0] as unknown as Record<string, unknown>;
    expect(probe.server_metadata).toBeUndefined();
  });

  it("detecta tipagem afrouxada: amount como string quebra o schema", () => {
    const bogus = {
      data: {
        installments: [
          {
            installment_number: 1,
            total_installments: 1,
            amount: "10" as unknown as number, // simula regressão upstream
            installment_source_amount: 10,
            installment_mode: "divide" as const,
          },
        ],
      },
    };
    const out = toDriftInput(bogus);
    // Runtime Zod pega o que o TS não pega mais depois de um cast frouxo.
    expect(() => DriftAssertInputZ.parse(out)).toThrow();
  });

  it("detecta drift inconsistente (delta ≠ |sum − source|)", () => {
    const out = toDriftInput({
      data: {
        installments: [row(1, 2, 5, 10), row(2, 2, 5, 10)],
        drift: { sum: 10, source: 10, delta: 0.5, tolerance: 0.02, ok: true },
      },
    });
    // Schema aceita (números finitos), mas a coerência falha:
    const parsed = DriftAssertInputZ.parse(out);
    expect(() => assertCoherent(parsed)).toThrow();
  });

  it("detecta tolerance inconsistente com N × 0.01", () => {
    const out = toDriftInput({
      data: {
        installments: [row(1, 3, 3.34, 10), row(2, 3, 3.33, 10), row(3, 3, 3.33, 10)],
        drift: { sum: 10, source: 10, delta: 0, tolerance: 0.99, ok: true },
      },
    });
    const parsed = DriftAssertInputZ.parse(out);
    expect(() => assertCoherent(parsed)).toThrow();
  });

  it("detecta drift.ok divergente da relação delta ≤ tolerance", () => {
    const out = toDriftInput({
      data: {
        installments: [row(1, 1, 10, 10)],
        drift: { sum: 10, source: 10, delta: 0, tolerance: 0.01, ok: false },
      },
    });
    const parsed = DriftAssertInputZ.parse(out);
    expect(() => assertCoherent(parsed)).toThrow();
  });

  /**
   * Compatibilidade total de versionamento de schema:
   *
   *   V1 (legado) — apenas os 5 campos obrigatórios do contrato.
   *   V2 (atual)  — adiciona metadados por parcela (server_generated_at,
   *                 rounding_policy, currency_code) e drift no envelope.
   *   V3 (futuro hipotético) — acrescenta campos AINDA desconhecidos
   *                 (audit_trail_id, ledger_ref, feature_flag), que os
   *                 parsers V1/V2 devem tolerar por forward-compat.
   *
   * O mapper deve:
   *   (a) manter os 5 campos obrigatórios de cada linha, independentemente
   *       da versão de origem;
   *   (b) descartar extras de qualquer versão (o schema `.strict()` acusa
   *       vazamento se o mapper regredir);
   *   (c) preservar coerência R1..R6 quando linhas heterogêneas coexistem
   *       no mesmo grupo (cenário real de migração progressiva).
   */
  it("V1+V2+V3 misturadas na mesma resposta mantêm contrato e coerência", () => {
    const v1Row: RawInstallmentRow = {
      installment_number: 1,
      total_installments: 3,
      amount: 33.34,
      installment_source_amount: 100,
      installment_mode: "divide",
    };
    const v2Row: RawInstallmentRow = {
      installment_number: 2,
      total_installments: 3,
      amount: 33.33,
      installment_source_amount: 100,
      installment_mode: "divide",
      // metadados V2 (passthrough upstream)
      server_generated_at: "2026-07-10T12:00:00.000Z",
      rounding_policy: "half-away-from-zero",
      currency_code: "BRL",
    };
    const v3Row: RawInstallmentRow = {
      installment_number: 3,
      total_installments: 3,
      amount: 33.33,
      installment_source_amount: 100,
      installment_mode: "divide",
      // metadados V3 futuros (ainda não modelados)
      audit_trail_id: "at_abc123",
      ledger_ref: { book: "cc-main", line: 42 },
      feature_flag: ["exp.rounding-v3", "exp.currency-fxrate"],
      // caso patológico: chave com nome colidindo com campo do contrato,
      // mas em subestrutura — deve permanecer inerte
      extras: { installment_number: 999, amount: -1 },
    };

    const body: RawDriftBody = {
      data: {
        installments: [v1Row, v2Row, v3Row],
        drift: {
          sum: 100,
          source: 100,
          delta: 0,
          tolerance: 0.03,
          ok: true,
          // metadados futuros no envelope de drift
          model_version: "drift-v3",
        },
      },
    };

    const out = toDriftInput(body);

    // (a) Cinco campos obrigatórios, apenas eles, em CADA linha.
    for (const r of out.data.installments) {
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
    // Nenhuma linha vazou metadados V2/V3.
    const probes = out.data.installments as unknown as ReadonlyArray<Record<string, unknown>>;
    for (const r of probes) {
      expect(r.server_generated_at).toBeUndefined();
      expect(r.rounding_policy).toBeUndefined();
      expect(r.currency_code).toBeUndefined();
      expect(r.audit_trail_id).toBeUndefined();
      expect(r.ledger_ref).toBeUndefined();
      expect(r.feature_flag).toBeUndefined();
      expect(r.extras).toBeUndefined();
    }

    // Drift extras também são descartados.
    expect(Object.keys(out.data.drift!).sort()).toEqual(
      ["delta", "ok", "source", "sum", "tolerance"],
    );

    // (b) Schema estrito passa (guarda contra .passthrough() leak).
    const parsed = DriftAssertInputZ.parse(out);

    // (c) R1..R6 coerentes entre linhas de versões distintas.
    assertCoherent(parsed);

    // Valores exatos das 3 linhas preservados (nada foi remapeado).
    expect(parsed.data.installments.map((r) => r.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(parsed.data.installments.map((r) => r.installment_number)).toEqual([1, 2, 3]);
  });
});

