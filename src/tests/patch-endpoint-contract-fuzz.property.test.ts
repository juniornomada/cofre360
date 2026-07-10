/**
 * Contrato PATCH — propriedades fuzz (fast-check).
 *
 * Varre valores aleatórios e garante invariantes globais do contrato de resposta 200.
 * Complementa os testes paramétricos existentes:
 *   - patch-endpoint-extreme-rounding-contract.integration.test.ts
 *   - patch-endpoint-large-N-contract.integration.test.ts
 *
 * Propriedades verificadas sobre TODA execução válida (200):
 *   F1. `data.installments.length === N`, numeração 1..N sem lacunas/duplicatas.
 *   F2. Cada parcela: ≤ 2 casas decimais, valor ≥ 0, mode consistente.
 *   F3. `data.drift.sum === Σ parcelas` (float-safe via cents).
 *   F4. `data.drift.tolerance === round2(N × 0.01)`.
 *   F5. |Σ − source| ≤ N × 1¢ em TODA execução (invariante regulamentar).
 *   F6. `data.drift.ok === true` sempre que 200 é retornado.
 *   F7. Modo divide: spread(max − min) ≤ 1¢ e nº de parcelas "altas" == diff¢.
 *   F8. Modo fixed: drift == 0 e Σ == parcela × N.
 *   F9. Robustez: handler nunca lança; respostas inválidas caem em 4xx.
 *
 * Cada propriedade roda 300 execuções (numRuns) com sementes reproduzíveis.
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);

type OkBody = Extract<PatchContractResponse, { status: 200 }>["body"];
type OkData = OkBody["data"];

const NUM_RUNS = 300;

function req(body: unknown, id = "fuzz-tx") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

async function patch(
  body: unknown,
  currentRow: {
    amount: number;
    total_installments: number;
    installment_mode?: "divide" | "fixed";
    installment_source_amount?: number;
  } | null = null,
): Promise<PatchContractResponse> {
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
  return handlePatchTransactionContract(req(body), { persist, currentRow });
}

/** valida invariantes F1..F7 sobre um sucesso divide. */
function assertDivideInvariants(data: OkData, N: number) {
  // F1
  expect(data.installments).toHaveLength(N);
  const nums = data.installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));

  // F2
  for (const r of data.installments) {
    expect(r.total_installments).toBe(N);
    expect(r.installment_mode).toBe("divide");
    expect(r.amount).toBeGreaterThanOrEqual(0);
    // 2 casas decimais → round trip idempotente em centavos
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
  }

  // F3 (via cents para evitar float noise)
  const sumCents = data.installments.reduce((s, r) => s + toCents(r.amount), 0);
  expect(toCents(data.drift.sum)).toBe(sumCents);

  // F4
  expect(data.drift.tolerance).toBe(round2(N * CENT));

  // F5 — invariante regulamentar
  const diffCents = Math.abs(sumCents - toCents(data.drift.source));
  expect(diffCents).toBeLessThanOrEqual(N);

  // F6
  expect(data.drift.ok).toBe(true);

  // F7 — distribuição do centavo
  const cents = data.installments.map((r) => toCents(r.amount));
  const maxC = Math.max(...cents);
  const minC = Math.min(...cents);
  expect(maxC - minC).toBeLessThanOrEqual(1);
  if (maxC - minC === 1) {
    const highs = cents.filter((c) => c === maxC).length;
    expect(highs).toBe(diffCents);
  }
}

// ---------------- arbitrárias ----------------
// amount: gama larga [0.01 .. 10_000_000] com fração de centavo aleatória.
const amountArb = fc
  .oneof(
    // valores pequenos densos (0.001 .. 1)
    fc.double({ min: 0.001, max: 1, noNaN: true, noDefaultInfinity: true }),
    // valores médios
    fc.double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true }),
    // valores altos
    fc.double({ min: 10_000, max: 10_000_000, noNaN: true, noDefaultInfinity: true }),
    // valores "half-up" clássicos
    fc.constantFrom(0.005, 0.015, 0.025, 1.005, 2.675, 999.995, 100 / 3, 100 / 7, 100 / 9),
  )
  .filter((n) => Number.isFinite(n) && n > 0)
  .map((n) => Math.round(n * 1000) / 1000); // até 3 casas → força half-up no handler

const NArb = fc.integer({ min: 1, max: 360 });

// ---------------- suíte ----------------
describe("Contrato PATCH — fuzz (fast-check)", () => {
  it("F1..F7 — para qualquer (amount, N) válido, invariantes divide se mantêm", async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, NArb, async (amount, N) => {
        const res = await patch({ amount, total_installments: N });
        // Se por alguma razão o handler recusar (ex.: amount saneado vira 0
        // após arredondamento e schema rejeita), aceitamos 4xx.
        if (res.status !== 200) {
          expect([400, 422]).toContain(res.status);
          return;
        }
        assertDivideInvariants(res.body.data, N);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("F5 (foco) — |Σ − source| ≤ N¢ para varredura densa em N com amount aleatório", async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, fc.integer({ min: 1, max: 360 }), async (amount, N) => {
        const res = await patch({ amount, total_installments: N });
        if (res.status !== 200) return;
        const { installments, drift } = res.body.data;
        const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
        const diffCents = Math.abs(sumCents - toCents(drift.source));
        expect(diffCents).toBeLessThanOrEqual(N);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("F8 — modo fixed: drift == 0 e Σ == parcela × N para qualquer parcela × N", async () => {
    const parcelaArb = fc
      .double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true })
      .map((n) => Math.round(n * 100) / 100)
      .filter((n) => n > 0);

    await fc.assert(
      fc.asyncProperty(parcelaArb, NArb, async (parcela, N) => {
        const res = await patch(
          { amount: parcela },
          { amount: parcela, total_installments: N, installment_mode: "fixed" },
        );
        if (res.status !== 200) {
          expect([400, 422]).toContain(res.status);
          return;
        }
        const data = res.body.data;
        expect(data.installments).toHaveLength(N);
        expect(data.drift.delta).toBe(0);
        // comparação em cents evita float noise em parcela × N
        expect(toCents(data.drift.sum)).toBe(toCents(round2(parcela * N)));
        for (const r of data.installments) {
          expect(r.installment_mode).toBe("fixed");
          expect(r.amount).toBe(round2(parcela));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("F9 — robustez: handler nunca lança e responde sempre com shape válido", async () => {
    // arbitrária hostil: mistura tipos, campos fora do allowlist, extremos numéricos.
    const hostileBody = fc.oneof(
      fc.record({
        amount: fc.oneof(fc.double(), fc.constant(NaN), fc.constant(Infinity), fc.string()),
        total_installments: fc.oneof(fc.integer(), fc.constant(0), fc.constant(-1), fc.constant(500), fc.string()),
      }),
      fc.record({ foo: fc.string(), bar: fc.integer() }),
      fc.record({ amount: amountArb, total_installments: NArb, __proto__: fc.constant({ polluted: true }) }),
      fc.anything(),
    );

    await fc.assert(
      fc.asyncProperty(hostileBody, async (body) => {
        const res = await patch(body);
        expect([200, 400, 404, 405, 415, 422]).toContain(res.status);
        if (res.status === 200) {
          const data = res.body.data;
          expect(Array.isArray(data.installments)).toBe(true);
          expect(typeof data.drift.ok).toBe("boolean");
          expect(data.drift.ok).toBe(true);
          const sumCents = data.installments.reduce((s, r) => s + toCents(r.amount), 0);
          const diffCents = Math.abs(sumCents - toCents(data.drift.source));
          expect(diffCents).toBeLessThanOrEqual(data.installments.length);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("Idempotência — dois PATCHes com o mesmo payload aleatório produzem o mesmo contrato", async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, NArb, async (amount, N) => {
        const r1 = await patch({ amount, total_installments: N });
        const r2 = await patch({ amount, total_installments: N });
        expect(r1.status).toBe(r2.status);
        if (r1.status === 200 && r2.status === 200) {
          expect(r2.body.data.installments).toEqual(r1.body.data.installments);
          expect(r2.body.data.drift).toEqual(r1.body.data.drift);
          expect(r2.body.data.normalized).toEqual(r1.body.data.normalized);
        }
      }),
      { numRuns: 150 },
    );
  });
});
