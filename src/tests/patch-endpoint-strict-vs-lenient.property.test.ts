/**
 * Property-based — invariância da normalização entre parsers ESTRITO e LENIENTE
 * frente a respostas enriquecidas com campos futuros ALEATÓRIOS.
 *
 * Contrato protegido (por geração, não por exemplo):
 *
 *   Para todo par (base 200, ruído-futuro):
 *     P1. strict.parse(normalizedBase)        ≡ strict.parse(normalizedEnriched)
 *     P2. lenient.parse(rawBase)              não lança
 *     P3. lenient.parse(rawEnriched)          não lança
 *     P4. toDriftInput(rawBase)               ≡ toDriftInput(rawEnriched)  (deep-equal)
 *     P5. Invariante econômico:
 *           |Σ installments.amount − installment_source_amount| ≤ N¢
 *     P6. drift (quando presente): ok=true, delta ≤ tolerance,
 *           tolerance = round2(N × 0.01), sum coerente com installments.
 *
 * Estratégia:
 *   • O "base" vem do endpoint real (`handlePatchTransactionVersioned`) para
 *     evitar hard-coding do formato — se o contrato mudar, os testes falham
 *     no lugar certo.
 *   • O "ruído futuro" é gerado com um arbitrary recursivo de JSON (incluindo
 *     arrays, objetos aninhados, chaves com ponto, unicode e nulls), com
 *     controle de profundidade.
 *   • O ruído é injetado em pontos-alvo (root, data, drift, cada installment)
 *     escolhidos pelo próprio fast-check.
 *   • Falhas emitem seed/path via `fcAssertWithRepro` para reprodução direta.
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { z } from "zod";
import { fcAssertWithRepro } from "./helpers/fc-assert";
import {
  handlePatchTransactionVersioned,
  type VersionedRequest,
} from "@/lib/patch-transaction-versioned";
import {
  toDriftInput,
  type RawDriftBody,
} from "@/lib/drift-input-mapper";

// ---------------- Utilitários ----------------

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function makeCtx() {
  return {
    persist: vi.fn(
      async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }),
    ),
    currentRow: null as null,
  };
}

function req(body: unknown, version: "1" | "2" | "3", id: string): VersionedRequest {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
    headers: { "Accept-Version": version },
  };
}

// ---------------- Schemas de referência ----------------

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

const InstallmentLenientZ = InstallmentStrictZ.passthrough();
const DriftLenientZ = DriftStrictZ.passthrough();

// ---------------- Arbitraries ----------------

/** JSON arbitrário e recursivo — cobre todos os tipos + estruturas aninhadas. */
const jsonValueArb: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.integer({ min: -1e6, max: 1e6 }),
    fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
    fc.string({ maxLength: 12 }),
  ),
  node: fc.oneof(
    { maxDepth: 3, depthIdentifier: "json" },
    tie("leaf"),
    fc.array(tie("node") as fc.Arbitrary<unknown>, { maxLength: 4 }),
    fc.dictionary(
      fc.oneof(
        fc.string({ maxLength: 8 }),
        fc.constantFrom("fut.dotted", "🚀", "meta_v3", "shadow"),
      ),
      tie("node") as fc.Arbitrary<unknown>,
      { maxKeys: 4 },
    ),
  ),
})).node as fc.Arbitrary<unknown>;

/** Bag de campos futuros a fundir em um nó (chaves não colidem com canônicas). */
const futureBagArb: fc.Arbitrary<Record<string, unknown>> = fc
  .dictionary(
    fc
      .string({ minLength: 1, maxLength: 10 })
      .filter(
        (k) =>
          ![
            "installment_number",
            "total_installments",
            "amount",
            "installment_source_amount",
            "installment_mode",
            "sum",
            "source",
            "delta",
            "tolerance",
            "ok",
            "id",
            "schema_version",
            "installments",
            "drift",
            "normalized",
            "data",
          ].includes(k),
      )
      .map((k) => `fut_${k}`),
    jsonValueArb,
    { minKeys: 0, maxKeys: 6 },
  );

/** Parâmetros do request base (limites conservadores para manter os runs rápidos). */
const requestParamsArb = fc.record({
  amount: fc.double({
    noNaN: true,
    noDefaultInfinity: true,
    min: 0.01,
    max: 1_000_000,
  }).map(round2).filter((v) => v > 0),
  N: fc.integer({ min: 1, max: 60 }),
  mode: fc.constantFrom<"divide" | "fixed">("divide", "fixed"),
  version: fc.constantFrom<"1" | "2" | "3">("1", "2", "3"),
});

// ---------------- Injeção de ruído ----------------

type EnvelopeShape = {
  data?: {
    installments?: Array<Record<string, unknown>>;
    drift?: Record<string, unknown>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

function enrich(
  raw: EnvelopeShape,
  bags: {
    root: Record<string, unknown>;
    data: Record<string, unknown>;
    drift: Record<string, unknown>;
    perRow: Array<Record<string, unknown>>;
  },
): EnvelopeShape {
  const clone = JSON.parse(JSON.stringify(raw)) as EnvelopeShape;
  Object.assign(clone, bags.root);
  if (clone.data) {
    Object.assign(clone.data, bags.data);
    if (Array.isArray(clone.data.installments)) {
      clone.data.installments = clone.data.installments.map((r, i) => ({
        ...r,
        ...(bags.perRow[i] ?? {}),
      }));
    }
    if (clone.data.drift && typeof clone.data.drift === "object") {
      Object.assign(clone.data.drift, bags.drift);
    }
  }
  return clone;
}

/** Remove chaves não-canônicas dos dois nós auditados — a "normalização". */
function normalize(raw: EnvelopeShape): EnvelopeShape {
  const clone = JSON.parse(JSON.stringify(raw)) as EnvelopeShape;
  if (!clone.data) return clone;

  const rows = clone.data.installments;
  if (Array.isArray(rows)) {
    clone.data.installments = rows.map((r) => ({
      installment_number: r.installment_number,
      total_installments: r.total_installments,
      amount: r.amount,
      installment_source_amount: r.installment_source_amount,
      installment_mode: r.installment_mode,
    }));
  }
  const d = clone.data.drift;
  if (d && typeof d === "object") {
    clone.data.drift = {
      sum: (d as Record<string, unknown>).sum,
      source: (d as Record<string, unknown>).source,
      delta: (d as Record<string, unknown>).delta,
      tolerance: (d as Record<string, unknown>).tolerance,
      ok: (d as Record<string, unknown>).ok,
    };
  }
  return clone;
}

// ---------------- Asserções de invariantes ----------------

function assertInvariants(raw: EnvelopeShape, N: number) {
  const rows = (raw.data?.installments ?? []) as Array<Record<string, unknown>>;
  expect(rows.length).toBeGreaterThan(0);

  // P5 — invariante econômico.
  const src = rows[0].installment_source_amount as number;
  const sumC = rows.reduce((s, r) => s + toCents(r.amount as number), 0);
  expect(Math.abs(sumC - toCents(src))).toBeLessThanOrEqual(N);

  // P6 — drift (V2/V3).
  const drift = raw.data?.drift as
    | { sum: number; delta: number; tolerance: number; ok: boolean }
    | undefined;
  if (drift) {
    expect(drift.ok).toBe(true);
    expect(drift.tolerance).toBe(round2(N * 0.01));
    expect(drift.delta).toBeLessThanOrEqual(drift.tolerance + 1e-9);
    expect(toCents(drift.sum)).toBe(sumC);
  }
}

// ---------------- Testes ----------------

describe("PATCH — invariância normalização (estrito vs. leniente) sob campos futuros aleatórios", () => {
  it("property: strict(normalized) e lenient(raw) concordam; toDriftInput é invariante ao ruído", async () => {
    let runs = 0;

    await fcAssertWithRepro(
      fc.asyncProperty(
        requestParamsArb,
        futureBagArb, // root
        futureBagArb, // data
        futureBagArb, // drift
        fc.array(futureBagArb, { maxLength: 60 }), // perRow
        async (params, rootBag, dataBag, driftBag, rowBags) => {
          const ctx = makeCtx();
          const res = await handlePatchTransactionVersioned(
            req(
              {
                amount: params.amount,
                total_installments: params.N,
                installment_mode: params.mode,
              },
              params.version,
              `tx-prop-${runs++}`,
            ),
            ctx,
          );
          // Só nos interessam respostas 200 — o gerador pode produzir combinações
          // que o endpoint rejeita (ex.: modo fixed com quantização impossível).
          if (res.status !== 200) return;

          const rawBase = res.body as unknown as EnvelopeShape;

          const enriched = enrich(rawBase, {
            root: rootBag,
            data: dataBag,
            drift: driftBag,
            perRow: rowBags,
          });

          const normalizedBase = normalize(rawBase);
          const normalizedEnriched = normalize(enriched);

          // P1 — o strict aceita EXATAMENTE o mesmo shape depois da normalização.
          const baseData = (normalizedBase as { data: { installments: unknown[]; drift?: unknown } }).data;
          const enrData = (normalizedEnriched as { data: { installments: unknown[]; drift?: unknown } }).data;

          for (const row of baseData.installments) {
            expect(() => InstallmentStrictZ.parse(row)).not.toThrow();
          }
          for (const row of enrData.installments) {
            expect(() => InstallmentStrictZ.parse(row)).not.toThrow();
          }
          if (baseData.drift) {
            expect(() => DriftStrictZ.parse(baseData.drift)).not.toThrow();
          }
          if (enrData.drift) {
            expect(() => DriftStrictZ.parse(enrData.drift)).not.toThrow();
          }

          // P2/P3 — o leniente aceita ambos os brutos.
          const rawData = (rawBase as { data: { installments: unknown[]; drift?: unknown } }).data;
          const enrRawData = (enriched as { data: { installments: unknown[]; drift?: unknown } }).data;
          for (const r of rawData.installments) {
            InstallmentLenientZ.parse(r);
          }
          for (const r of enrRawData.installments) {
            InstallmentLenientZ.parse(r);
          }
          if (rawData.drift) DriftLenientZ.parse(rawData.drift);
          if (enrRawData.drift) DriftLenientZ.parse(enrRawData.drift);

          // P4 — o mapper é ponto-fixo em relação a campos futuros.
          const mapBase = toDriftInput(rawBase as RawDriftBody);
          const mapEnriched = toDriftInput(enriched as RawDriftBody);
          expect(mapEnriched).toEqual(mapBase);

          // P5/P6 — invariantes econômicos em ambos os payloads.
          assertInvariants(rawBase, params.N);
          assertInvariants(enriched, params.N);
        },
      ),
      { label: "strict-vs-lenient invariance", numRuns: 60 },
    );

    expect(runs).toBeGreaterThan(0);
  });

  it("property: chaves canônicas nunca são substituídas pelo ruído futuro", async () => {
    await fcAssertWithRepro(
      fc.asyncProperty(
        requestParamsArb,
        // Bag propositalmente MALICIOSA: chaves canônicas SÃO permitidas aqui,
        // mas em sub-objetos (não substituem o campo top-level real).
        fc.array(
          fc.record({
            shadow: fc.record({
              installment_number: fc.integer({ min: -100, max: -1 }),
              amount: fc.double({ noNaN: true, min: -999, max: -1 }),
              installment_mode: fc.constant("not-a-mode"),
            }),
            noise: futureBagArb,
          }),
          { maxLength: 60 },
        ),
        async (params, bags) => {
          const ctx = makeCtx();
          const res = await handlePatchTransactionVersioned(
            req(
              {
                amount: params.amount,
                total_installments: params.N,
                installment_mode: params.mode,
              },
              params.version,
              "tx-shadow",
            ),
            ctx,
          );
          if (res.status !== 200) return;

          const raw = res.body as unknown as EnvelopeShape;
          const enriched = enrich(raw, {
            root: {},
            data: {},
            drift: {},
            perRow: bags.map((b) => ({ ...b.noise, shadow_contract: b.shadow })),
          });

          const rows = (enriched.data?.installments ?? []) as Array<Record<string, unknown>>;
          for (const [i, r] of rows.entries()) {
            expect(typeof r.installment_number).toBe("number");
            expect(r.installment_number).toBeGreaterThan(0);
            expect(["divide", "fixed"]).toContain(r.installment_mode);
            // shadow_contract permanece isolado — não vazou p/ top-level.
            const shadow = r.shadow_contract as Record<string, unknown> | undefined;
            if (shadow) {
              expect(shadow.installment_number).toBeLessThan(0);
              expect((r.installment_number as number) > 0).toBe(true);
            }
            // Idempotência mapper-lado.
            expect(rows[i].total_installments).toBe(params.N);
          }
          assertInvariants(enriched, params.N);
        },
      ),
      { label: "canonical fields not shadowed", numRuns: 40 },
    );
  });
});
