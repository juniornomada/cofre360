/**
 * PATCH — limites de casas decimais e regras de arredondamento.
 *
 * Objetivo: garantir que, durante um PATCH da transação, quaisquer entradas
 * com precisão excessiva (sub-centavo, fronteiras half-up, dízimas) ou com
 * limites de casas decimais atípicos NUNCA violem o invariante financeiro:
 *
 *     |Σparcelas − installment_source_amount| ≤ N × 1¢
 *
 * Cobertura:
 *   D1. Sub-centavo em `amount` — 0.001, 0.004, 0.005, 0.009
 *   D2. Fronteiras half-up — 1.005, 2.675, 0.015, 0.025
 *   D3. Dízimas periódicas — 100/3, 100/6, 100/7, 100/9, 1/3
 *   D4. Valores altos com fração — 9_999_999.99, 1_234_567.89
 *   D5. Precisão fantasma de ponto flutuante (0.1 + 0.2)
 *   D6. Todos os `installments[*].amount` têm ≤ 2 casas decimais
 *   D7. Varredura densa N ∈ [1..36] com dízima source=100
 *   D8. Merge com currentRow — patch parcial só de N usa amount atual
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

type OkBody = Extract<PatchContractResponse, { status: 200 }>["body"];

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

function req(body: unknown, id = "tx-decimal") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

function persistEcho() {
  return vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
}

function assertDriftInvariant(body: OkBody, expectedN: number) {
  const d = body.data;
  expect(d.installments).toHaveLength(expectedN);
  // Cada parcela deve ter ≤ 2 casas decimais e ser múltiplo de 1¢
  for (const row of d.installments) {
    expect(decimalPlaces(row.amount)).toBeLessThanOrEqual(2);
    expect(round2(row.amount)).toBe(row.amount);
    expect(row.installment_source_amount).toBe(round2(row.installment_source_amount));
    expect(row.total_installments).toBe(expectedN);
  }
  // Invariante regulamentar
  const sum = round2(d.installments.reduce((s, r) => s + r.amount, 0));
  const tol = expectedN * CENT + 1e-9;
  expect(Math.abs(sum - d.drift.source)).toBeLessThanOrEqual(tol);
  expect(d.drift.delta).toBeLessThanOrEqual(d.drift.tolerance + 1e-9);
  expect(d.drift.ok).toBe(true);
}

async function patchOk(body: unknown, currentRow: {
  amount: number;
  total_installments: number;
  installment_mode?: "divide" | "fixed";
  installment_source_amount?: number;
} | null = null): Promise<OkBody> {
  const persist = persistEcho();
  const res = await handlePatchTransactionContract(req(body), { persist, currentRow });
  if (res.status !== 200) {
    throw new Error(`Esperava 200, obteve ${res.status}: ${JSON.stringify(res)}`);
  }
  return res.body;
}

describe("PATCH — limites de casas decimais e arredondamento (drift ≤ N¢)", () => {
  // ------------------- D1: sub-centavo -------------------
  it.each([
    { amount: 0.001, N: 1 },
    { amount: 0.004, N: 3 },
    { amount: 0.005, N: 5 },
    { amount: 0.009, N: 12 },
  ])("D1: sub-cent amount=$amount, N=$N → arredonda para múltiplo de 1¢", async ({ amount, N }) => {
    const body = await patchOk({ amount, total_installments: N });
    assertDriftInvariant(body, N);
    // normalized.amount sofreu round2 no handler
    expect(decimalPlaces(body.data.normalized.amount as number)).toBeLessThanOrEqual(2);
  });

  // ---------------- D2: fronteiras half-up ----------------
  it.each([
    { amount: 1.005, N: 1 },
    { amount: 2.675, N: 1 },
    { amount: 0.015, N: 3 },
    { amount: 0.025, N: 5 },
    { amount: 12.065, N: 12 },
    { amount: 999.995, N: 7 },
  ])("D2: half-up amount=$amount, N=$N → cada parcela com ≤ 2 casas", async ({ amount, N }) => {
    const body = await patchOk({ amount, total_installments: N });
    assertDriftInvariant(body, N);
  });

  // -------------------- D3: dízimas --------------------
  it.each([
    { amount: 100, N: 3 },   // 33.33 × 3 = 99.99 → drift 1¢
    { amount: 100, N: 6 },   // 16.67 × 6 = 100.02 → drift 2¢
    { amount: 100, N: 7 },   // 14.29 × 7 = 100.03 → drift 3¢
    { amount: 100, N: 9 },   // 11.11 × 9 = 99.99
    { amount: 1, N: 3 },     // 0.33 × 3 = 0.99
    { amount: 10, N: 9 },    // 1.11 × 9 = 9.99
    { amount: 1000, N: 7 },  // 142.86 × 7 = 1000.02
  ])("D3: dízima amount=$amount, N=$N → drift ≤ N¢", async ({ amount, N }) => {
    const body = await patchOk({ amount, total_installments: N });
    assertDriftInvariant(body, N);
  });

  // ---------------- D4: valores altos com fração ----------------
  it.each([
    { amount: 9_999_999.99, N: 12 },
    { amount: 1_234_567.89, N: 7 },
    { amount: 1_000_000, N: 3 },
  ])("D4: alto amount=$amount, N=$N mantém 2 casas exatas e drift ≤ N¢", async ({ amount, N }) => {
    const body = await patchOk({ amount, total_installments: N });
    assertDriftInvariant(body, N);
  });

  // ---------------- D5: precisão fantasma (0.1 + 0.2) ----------------
  it("D5: amount = 0.1 + 0.2 (=0.30000000000000004) → normaliza para 0.30 e drift ok", async () => {
    const ghost = 0.1 + 0.2;
    const body = await patchOk({ amount: ghost, total_installments: 3 });
    expect(body.data.normalized.amount).toBe(0.3);
    assertDriftInvariant(body, 3);
  });

  // ---------------- D6: validação de casas decimais em installments[] ----------------
  it("D6: nenhuma parcela pode ter mais que 2 casas decimais, para qualquer N ∈ [1..24]", async () => {
    for (let N = 1; N <= 24; N++) {
      const body = await patchOk({ amount: 100, total_installments: N });
      for (const row of body.data.installments) {
        expect(decimalPlaces(row.amount)).toBeLessThanOrEqual(2);
        expect(row.amount * 100).toBeCloseTo(Math.round(row.amount * 100), 9);
      }
      assertDriftInvariant(body, N);
    }
  });

  // ---------------- D7: varredura densa N ∈ [1..36] em dízima ----------------
  it("D7: source=100 em N=1..36 → drift SEMPRE ≤ N¢", async () => {
    for (let N = 1; N <= 36; N++) {
      const body = await patchOk({ amount: 100, total_installments: N });
      const sum = body.data.installments.reduce((s, r) => s + r.amount, 0);
      const diffCents = Math.round(Math.abs(sum - body.data.drift.source) * 100);
      expect(diffCents).toBeLessThanOrEqual(N);
      assertDriftInvariant(body, N);
    }
  });

  // ---------------- D8: patch parcial de N — merge com currentRow ----------------
  it("D8a: patch só de total_installments usa amount atual e mantém drift", async () => {
    // Row atual: amount=33.33, N=3 → source ~ 99.99. Patch muda N para 7.
    const body = await patchOk(
      { total_installments: 7 },
      { amount: 33.33, total_installments: 3, installment_mode: "divide", installment_source_amount: 99.99 },
    );
    assertDriftInvariant(body, 7);
    expect(body.data.normalized).not.toHaveProperty("amount");
  });

  it("D8b: patch só de amount (dízima) recalcula source com N atual", async () => {
    const body = await patchOk(
      { amount: 100 / 3 }, // 33.333...
      { amount: 50, total_installments: 3, installment_mode: "divide" },
    );
    // amount normalizado deve ser round2(100/3) = 33.33
    expect(body.data.normalized.amount).toBe(33.33);
    assertDriftInvariant(body, 3);
  });

  // ---------------- D9: modo fixed preserva soma exata ----------------
  it("D9: modo fixed com parcela quebrada (0.07) e N=7 → drift 0", async () => {
    const body = await patchOk(
      { amount: 0.07 },
      { amount: 0.07, total_installments: 7, installment_mode: "fixed" },
    );
    assertDriftInvariant(body, 7);
    // Em fixed, soma = parcela × N exatamente
    const sum = round2(body.data.installments.reduce((s, r) => s + r.amount, 0));
    expect(sum).toBe(round2(0.07 * 7));
  });

  // ---------------- D10: entradas hostis de precisão são rejeitadas ANTES do cálculo ----------------
  it.each([
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { amount: Number.NEGATIVE_INFINITY },
  ])("D10: amount=$amount é rejeitado (não chega no cálculo de parcelas)", async ({ amount }) => {
    const persist = persistEcho();
    const res = await handlePatchTransactionContract(
      req({ amount, total_installments: 3 }),
      { persist, currentRow: null },
    );
    expect(res.status).toBe(422);
    expect(persist).not.toHaveBeenCalled();
  });
});
