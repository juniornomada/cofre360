/**
 * Contrato PATCH — enriquecimento futuro DENTRO de `installments[i]` e `drift`.
 *
 * Diferentemente de testes anteriores que injetam futuros no root/data, aqui
 * o alvo é EXCLUSIVAMENTE os dois nós que carregam invariantes numéricas:
 *
 *   • cada linha de `data.installments[i]`
 *   • o subobjeto `data.drift`
 *
 * O contrato que este teste protege:
 *
 *   1. O parser leniente NÃO quebra ao encontrar chaves futuras adicionais
 *      nesses dois nós, com qualquer combinação de tipos (string, número,
 *      boolean, null, array, objeto aninhado, chaves com pontos, sub-objetos
 *      colidindo com o nome das chaves canônicas).
 *   2. As chaves canônicas (installment_number, total_installments, amount,
 *      installment_source_amount, installment_mode) mantêm seus TIPOS e
 *      VALORES; nada em torno delas as substitui.
 *   3. Para toda resposta 200 (em V1, V2 e V3) e para toda N ∈ {1, 2, 3, 12,
 *      24, 60, 120, 360}, vale |Σ installments.amount − installment_source_amount| ≤ N¢.
 *   4. Quando o envelope traz `drift` (V2/V3), o campo `drift.ok` é `true`,
 *      `drift.tolerance = round2(N * 0.01)` e `drift.delta ≤ drift.tolerance`,
 *      independentemente do lixo futuro anexado.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  handlePatchTransactionVersioned,
  type VersionedRequest,
  type VersionedResponse,
} from "@/lib/patch-transaction-versioned";

// ---------------- Helpers ----------------

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function makeCtx() {
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
    id,
    ...patch,
  }));
  return { persist, currentRow: null as null };
}

function req(
  body: unknown,
  opts: { id?: string; headers?: Record<string, string | undefined> } = {},
): VersionedRequest {
  return {
    method: "PATCH",
    id: opts.id ?? "tx-inner-junk",
    contentType: "application/json",
    rawBody: JSON.stringify(body),
    headers: opts.headers,
  };
}

// Schemas lenientes — passthrough SÓ nos dois nós auditados neste teste.
const InstallmentLenientZ = z
  .object({
    installment_number: z.number().int().positive(),
    total_installments: z.number().int().positive(),
    amount: z.number().finite().nonnegative(),
    installment_source_amount: z.number().finite().nonnegative(),
    installment_mode: z.enum(["divide", "fixed"]),
  })
  .passthrough();

const DriftLenientZ = z
  .object({
    sum: z.number(),
    source: z.number(),
    delta: z.number().nonnegative(),
    tolerance: z.number().nonnegative(),
    ok: z.boolean(),
  })
  .passthrough();

const V1LenientZ = z.object({
  schema_version: z.literal("1"),
  data: z.object({
    id: z.string(),
    installments: z.array(InstallmentLenientZ).min(1),
  }),
});

const V2LenientZ = z.object({
  schema_version: z.literal("2"),
  data: z.object({
    id: z.string(),
    normalized: z.object({}).passthrough(),
    installments: z.array(InstallmentLenientZ).min(1),
    drift: DriftLenientZ,
  }),
});

const V3LenientZ = z.object({
  schema_version: z.literal("3"),
  data: z.object({
    id: z.string(),
    schema_version: z.literal("3"),
    normalized: z.object({}).passthrough(),
    installments: z.array(InstallmentLenientZ).min(1),
    drift: DriftLenientZ,
  }),
});

/** Coleção fixa de "campos futuros" a serem espalhados. A variedade cobre
 *  todos os JSON types e alguns padrões traiçoeiros que já vazaram no passado. */
function futureNoiseForInstallment(seed: number): Record<string, unknown> {
  return {
    // primitivos
    fut_string: `s-${seed}`,
    fut_number: 1_000_000 + seed,
    fut_bool: seed % 2 === 0,
    fut_null: null,
    // coleções
    fut_array: [1, "two", null, { nested: true }],
    fut_object: { a: 1, b: { c: [1, 2, 3] } },
    // chave com ponto (algumas libs colapsam paths com ponto)
    "fut.dotted.key": "should-survive",
    // sub-objeto que COLIDE em nomes com o contrato — precisa ficar isolado
    shadow_contract: {
      installment_number: -1,
      amount: -999.99,
      installment_mode: "not-a-mode",
      total_installments: 0,
    },
    // metadados aninhados fundos
    deep: { l1: { l2: { l3: { seed } } } },
    // valores extremos
    fut_big: Number.MAX_SAFE_INTEGER - seed,
    fut_neg: -seed,
  };
}

function futureNoiseForDrift(): Record<string, unknown> {
  return {
    algo: "half-away-from-zero",
    model_version: "drift-v9",
    dimensions: ["sum", "source", "delta"],
    tags: [{ name: "beta" }, { name: "next" }],
    "config.rounding": "banker",
    shadow_metric: { sum: -1, source: -1, delta: 999, tolerance: 999, ok: false },
    trace: { spans: [{ id: "a" }, { id: "b" }], nested: { deep: { deep: 1 } } },
    computed_at: "2026-07-10T12:00:00.000Z",
    is_experimental: true,
  };
}

/** Injeta futuros DIRETAMENTE em installments e drift do body 200. */
function enrichInnerNodes<T>(body: T): T {
  const clone = JSON.parse(JSON.stringify(body)) as unknown as {
    data?: {
      installments?: Array<Record<string, unknown>>;
      drift?: Record<string, unknown>;
    };
  };
  const rows = clone.data?.installments;
  if (Array.isArray(rows)) {
    clone.data!.installments = rows.map((r, i) => ({ ...r, ...futureNoiseForInstallment(i) }));
  }
  if (clone.data?.drift && typeof clone.data.drift === "object") {
    clone.data.drift = { ...clone.data.drift, ...futureNoiseForDrift() };
  }
  return clone as unknown as T;
}

/** Asserção compartilhada — R1..R6 sobre um conjunto de parcelas + drift opcional. */
function assertDriftInvariants(
  installments: ReadonlyArray<z.infer<typeof InstallmentLenientZ>>,
  drift?: z.infer<typeof DriftLenientZ>,
) {
  const N = installments.length;

  // Chaves canônicas mantêm tipos e não foram sobrescritas pelo shadow_contract.
  for (const r of installments) {
    expect(typeof r.installment_number).toBe("number");
    expect(typeof r.total_installments).toBe("number");
    expect(typeof r.amount).toBe("number");
    expect(typeof r.installment_source_amount).toBe("number");
    expect(["divide", "fixed"]).toContain(r.installment_mode);
    // Assegura que o sub-objeto colidente NÃO afetou top-level.
    expect(r.installment_number).toBeGreaterThanOrEqual(1);
    expect(r.installment_number).toBeLessThanOrEqual(N);
    expect(r.total_installments).toBe(N);
  }
  // Contiguidade 1..N.
  expect(installments.map((r) => r.installment_number).sort((a, b) => a - b)).toEqual(
    Array.from({ length: N }, (_, i) => i + 1),
  );

  // Invariante econômico central deste teste.
  const src = installments[0].installment_source_amount;
  const sumC = installments.reduce((s, r) => s + toCents(r.amount), 0);
  const driftC = Math.abs(sumC - toCents(src));
  expect(driftC).toBeLessThanOrEqual(N);

  if (drift) {
    expect(drift.ok).toBe(true);
    expect(drift.tolerance).toBe(round2(N * 0.01));
    // delta em reais nunca excede tolerance em reais.
    expect(drift.delta).toBeLessThanOrEqual(drift.tolerance + 1e-9);
    expect(toCents(drift.sum)).toBe(sumC);
  }
}

// Matrizes de teste. amounts propositalmente com dízimas para maximizar
// resíduo de arredondamento (o pior caso do drift).
const N_MATRIX = [1, 2, 3, 12, 24, 60, 120, 360];
const AMOUNTS_WITH_REMAINDER = [100, 33.33, 999.99, 1234.56, 7, 1_000_000];

// ---------------- Testes ----------------

describe("PATCH — futuros injetados DENTRO de installments e drift", () => {
  it.each(
    N_MATRIX.flatMap((N) =>
      AMOUNTS_WITH_REMAINDER.map((amount) => ({ N, amount })),
    ),
  )("V2 leniente aceita ruído em installments+drift e drift ≤ N¢ (N=$N, amount=$amount)", async ({ N, amount }) => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ amount, total_installments: N }, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error(`bootstrap V2 falhou: ${res.status}`);

    const enriched = enrichInnerNodes(res.body);
    const parsed = V2LenientZ.parse(enriched);

    // O ruído SOBREVIVEU no envelope (passthrough) — evidência de forward-compat.
    for (const r of parsed.data.installments as unknown as Array<Record<string, unknown>>) {
      expect(r.fut_string).toBeDefined();
      expect(r["fut.dotted.key"]).toBe("should-survive");
      // O sub-objeto colidente permanece isolado.
      const shadow = r.shadow_contract as Record<string, unknown>;
      expect(shadow.installment_number).toBe(-1);
    }
    const driftAny = parsed.data.drift as unknown as Record<string, unknown>;
    expect(driftAny.algo).toBe("half-away-from-zero");
    expect(Array.isArray(driftAny.dimensions)).toBe(true);
    // shadow_metric não pode ter contaminado o canônico.
    const shadowMetric = driftAny.shadow_metric as Record<string, unknown>;
    expect(shadowMetric.ok).toBe(false);
    expect(parsed.data.drift.ok).toBe(true);

    assertDriftInvariants(parsed.data.installments, parsed.data.drift);
    expect(ctx.persist).toHaveBeenCalledTimes(1);
  });

  it.each(N_MATRIX)("V1 leniente aceita ruído nas parcelas e drift ≤ N¢ (N=%i)", async (N) => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ amount: 33.33, total_installments: N }, { headers: { "Accept-Version": "1" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error("bootstrap V1 falhou");

    const enriched = enrichInnerNodes(res.body);
    const parsed = V1LenientZ.parse(enriched);
    assertDriftInvariants(parsed.data.installments);
  });

  it.each(N_MATRIX)("V3 leniente aceita ruído e drift ≤ N¢ (N=%i)", async (N) => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ amount: 999.99, total_installments: N }, { headers: { "Accept-Version": "3" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error("bootstrap V3 falhou");
    const enriched = enrichInnerNodes(res.body);
    const parsed = V3LenientZ.parse(enriched);
    assertDriftInvariants(parsed.data.installments, parsed.data.drift);
  });

  it("mesmo com ruído extremamente pesado (100 chaves futuras por parcela) o parser aceita e o drift permanece", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ amount: 100, total_installments: 12 }, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error("bootstrap falhou");

    const clone = JSON.parse(JSON.stringify(res.body)) as VersionedResponse extends {
      status: 200;
      version: "2";
      body: infer B;
    }
      ? B
      : never;

    const rows = (clone as { data: { installments: Array<Record<string, unknown>> } }).data
      .installments;
    for (const r of rows) {
      for (let i = 0; i < 100; i++) {
        r[`fut_${i}`] = i % 3 === 0 ? { nested: i } : i % 3 === 1 ? [i, i + 1] : `val-${i}`;
      }
    }
    const driftObj = (clone as { data: { drift: Record<string, unknown> } }).data.drift;
    for (let i = 0; i < 100; i++) driftObj[`meta_${i}`] = { i, arr: [i] };

    const parsed = V2LenientZ.parse(clone);
    assertDriftInvariants(parsed.data.installments, parsed.data.drift);
  });

  it("ruído com chaves não-string-safe (unicode/emoji/vazias) não quebra o parser", async () => {
    const ctx = makeCtx();
    const res = await handlePatchTransactionVersioned(
      req({ amount: 100, total_installments: 3 }, { headers: { "Accept-Version": "2" } }),
      ctx,
    );
    if (res.status !== 200) throw new Error("bootstrap falhou");

    const clone = JSON.parse(JSON.stringify(res.body));
    for (const r of (clone as { data: { installments: Array<Record<string, unknown>> } }).data
      .installments) {
      r["🚀"] = "rocket";
      r[" "] = "space-key";
      r["\u0000"] = "null-char";
      r["مفتاح"] = "arabic-key";
    }
    const parsed = V2LenientZ.parse(clone);
    assertDriftInvariants(parsed.data.installments, parsed.data.drift);
  });
});
