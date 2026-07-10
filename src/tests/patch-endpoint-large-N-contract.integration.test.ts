/**
 * Contrato — limites extremos de N (N > 36 até N = 360).
 *
 * Complementa `patch-endpoint-extreme-rounding-contract.integration.test.ts`
 * cobrindo o recálculo de parcelas e o drift em N grandes:
 *
 *   L1. `data.installments.length === N` mesmo para N ∈ {37, 60, 120, 240, 360}.
 *   L2. Numeração 1..N sem lacunas nem duplicatas.
 *   L3. Cada parcela com ≤ 2 casas decimais e ≥ 0.
 *   L4. `|Σ − source| ≤ N × 1¢` (tolerância cresce linearmente com N).
 *   L5. Distribuição do centavo consistente: spread(max − min) ≤ 1¢ no divide,
 *       e nº de parcelas "altas" == diff em centavos.
 *   L6. Fronteira: N = 360 aceito (limite do schema); N = 361 → 422.
 *   L7. Fixed mode em N grande: drift == 0 (Σ == parcela × N).
 *   L8. Idempotência: dois PATCHes idênticos com N grande produzem o mesmo
 *       contrato (installments + drift + normalized).
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const CENT = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

type OkBody = Extract<PatchContractResponse, { status: 200 }>["body"];
type OkData = OkBody["data"];

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

function req(body: unknown, id = "tx-large-N") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

async function patchOk(
  body: unknown,
  currentRow: {
    amount: number;
    total_installments: number;
    installment_mode?: "divide" | "fixed";
    installment_source_amount?: number;
  } | null = null,
): Promise<OkData> {
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
  const res = await handlePatchTransactionContract(req(body), { persist, currentRow });
  if (res.status !== 200) throw new Error(`esperava 200, recebi ${res.status}: ${JSON.stringify(res)}`);
  return res.body.data;
}

/** invariantes de contrato para N grande, modo divide. */
function assertLargeNContract(data: OkData, N: number, expectedSource: number) {
  // L1
  expect(data.installments).toHaveLength(N);

  // L2 — numeração 1..N sem repetições
  const seen = new Set<number>();
  for (const r of data.installments) {
    expect(r.installment_number).toBeGreaterThanOrEqual(1);
    expect(r.installment_number).toBeLessThanOrEqual(N);
    expect(seen.has(r.installment_number)).toBe(false);
    seen.add(r.installment_number);
    expect(r.total_installments).toBe(N);
    // L3
    expect(decimalPlaces(r.amount)).toBeLessThanOrEqual(2);
    expect(round2(r.amount)).toBe(r.amount);
    expect(r.amount).toBeGreaterThanOrEqual(0);
    expect(r.installment_source_amount).toBe(round2(expectedSource));
  }
  expect(seen.size).toBe(N);

  // L4 — drift dentro da tolerância
  const sum = round2(data.installments.reduce((s, r) => s + r.amount, 0));
  expect(data.drift.sum).toBe(sum);
  expect(data.drift.source).toBe(round2(expectedSource));
  expect(data.drift.tolerance).toBe(round2(N * CENT));
  expect(data.drift.delta).toBeLessThanOrEqual(data.drift.tolerance + 1e-9);
  expect(data.drift.ok).toBe(true);
  const diffCents = Math.round(Math.abs(sum - data.drift.source) * 100);
  expect(diffCents).toBeLessThanOrEqual(N);

  // L5 — distribuição do centavo consistente
  const values = data.installments.map((r) => r.amount);
  const maxV = Math.max(...values);
  const minV = Math.min(...values);
  const spreadCents = Math.round((maxV - minV) * 100);
  expect(spreadCents).toBeLessThanOrEqual(1);
  if (spreadCents === 1) {
    const highs = values.filter((v) => Math.round((v - minV) * 100) === 1).length;
    expect(highs).toBe(diffCents);
  }
}

describe("Contrato PATCH — N grande (N > 36 até 360)", () => {
  // -------- L1..L5: cenários paramétricos com dízimas em N grande --------
  it.each([
    { amount: 100, N: 37 },
    { amount: 100, N: 48 },
    { amount: 100, N: 60 },
    { amount: 100, N: 72 },
    { amount: 100, N: 90 },
    { amount: 100, N: 120 },
    { amount: 100, N: 180 },
    { amount: 100, N: 240 },
    { amount: 100, N: 300 },
    { amount: 100, N: 360 },
    { amount: 33.33, N: 60 },
    { amount: 0.07, N: 120 },
    { amount: 1234.56, N: 240 },
    { amount: 9_999_999.99, N: 360 },
    { amount: 0.001, N: 360 }, // sub-cent × N máximo
    { amount: 0.1 + 0.2, N: 60 }, // float phantom
  ])("N=$N amount=$amount cumpre contrato completo", async ({ amount, N }) => {
    const data = await patchOk({ amount, total_installments: N });
    assertLargeNContract(data, N, round2(round2(amount) * N));
  });

  // -------- L6: fronteira do schema --------
  it("N = 360 é aceito (limite máximo do schema)", async () => {
    const data = await patchOk({ amount: 100, total_installments: 360 });
    assertLargeNContract(data, 360, round2(100 * 360));
  });

  it("N = 361 → 422 sem tocar em parcelas", async () => {
    const persist = vi.fn();
    const res = await handlePatchTransactionContract(req({ amount: 100, total_installments: 361 }), {
      persist,
      currentRow: null,
    });
    expect(res.status).toBe(422);
    expect(persist).not.toHaveBeenCalled();
  });

  it("N = 1000 → 422 sem tocar em parcelas", async () => {
    const persist = vi.fn();
    const res = await handlePatchTransactionContract(req({ amount: 100, total_installments: 1000 }), {
      persist,
      currentRow: null,
    });
    expect(res.status).toBe(422);
    expect(persist).not.toHaveBeenCalled();
  });

  // -------- L7: fixed mode em N grande --------
  it.each([
    { parcela: 33.33, N: 60 },
    { parcela: 0.01, N: 360 },
    { parcela: 999.99, N: 240 },
    { parcela: 83.33, N: 120 },
  ])("fixed parcela=$parcela × N=$N ⇒ drift 0 mesmo em N grande", async ({ parcela, N }) => {
    const data = await patchOk(
      { amount: parcela },
      { amount: parcela, total_installments: N, installment_mode: "fixed" },
    );
    expect(data.installments).toHaveLength(N);
    expect(data.drift.delta).toBe(0);
    expect(data.drift.sum).toBe(round2(parcela * N));
    for (const r of data.installments) {
      expect(r.installment_mode).toBe("fixed");
      expect(r.amount).toBe(round2(parcela));
    }
  });

  // -------- L8: idempotência em N grande --------
  it.each([
    { amount: 100, N: 60 },
    { amount: 100, N: 240 },
    { amount: 100, N: 360 },
    { amount: 33.33, N: 180 },
  ])("idempotência com N=$N (dízima $amount): dois PATCHes produzem o mesmo contrato", async ({ amount, N }) => {
    const a = await patchOk({ amount, total_installments: N });
    const b = await patchOk({ amount, total_installments: N });
    expect(b.installments).toEqual(a.installments);
    expect(b.drift).toEqual(a.drift);
    expect(b.normalized).toEqual(a.normalized);
  });

  // -------- varredura densa: N ∈ {37..48, 358..360} nas bordas --------
  it("varredura densa nas bordas: N ∈ {37..48} e {355..360} com source=100", async () => {
    const ranges = [
      ...Array.from({ length: 12 }, (_, i) => 37 + i),   // 37..48
      ...Array.from({ length: 6 }, (_, i) => 355 + i),   // 355..360
    ];
    for (const N of ranges) {
      const data = await patchOk({ amount: 100, total_installments: N });
      assertLargeNContract(data, N, round2(100 * N));
    }
  });

  // -------- microamostragem de dízimas patológicas em N grande --------
  it.each([
    { amount: 100, N: 60 },   // 100/60 = 1.6666… → esperado ≤ 60¢ de drift teórico
    { amount: 100, N: 90 },   // 1.1111…
    { amount: 100, N: 120 },  // 0.8333…
    { amount: 100, N: 180 },  // 0.5555…
    { amount: 100, N: 240 },  // 0.4166…
    { amount: 100, N: 300 },  // 0.3333…
    { amount: 100, N: 360 },  // 0.2777…
  ])("dízima 100 / N=$N — drift em centavos é finito e ≤ N", async ({ amount, N }) => {
    const data = await patchOk({ amount, total_installments: N });
    const diffCents = Math.round(Math.abs(data.drift.sum - data.drift.source) * 100);
    expect(Number.isFinite(diffCents)).toBe(true);
    expect(diffCents).toBeLessThanOrEqual(N);
    // sanidade adicional: o drift em centavos representa parcelas "elevadas" em 1¢
    expect(diffCents).toBeGreaterThanOrEqual(0);
  });
});
