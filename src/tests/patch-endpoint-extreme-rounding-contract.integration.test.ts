/**
 * Contrato — arredondamento extremo no PATCH.
 *
 * Objetivo: para toda entrada de arredondamento extremo (sub-cent, half-up,
 * dízimas, precisão fantasma de float, valores altos com fração), o CONTRATO
 * de resposta 200 do endpoint PATCH SEMPRE cumpre:
 *
 *   C1. `data.normalized` só contém chaves do allowlist e valores já saneados
 *       (amount arredondado a 2 casas; strings trimmed; nulls preservados).
 *   C2. `data.installments` tem exatamente N linhas com numeração 1..N,
 *       amount com ≤ 2 casas decimais e installment_source_amount coerente.
 *   C3. `data.drift`:
 *          delta ≤ tolerance (== N × 1¢), ok === true, sum == Σparcelas.
 *   C4. Fixed mode: Σparcelas == parcela × N exato (drift == 0).
 *   C5. Idempotência: dois PATCHes idênticos produzem o MESMO contrato
 *       (mesmas parcelas, mesmo drift).
 *   C6. Estabilidade sob N ∈ [1..36] com dízima source=100.
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

function req(body: unknown, id = "tx-extreme-contract") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

const ALLOWED = new Set([
  "name",
  "amount",
  "total_installments",
  "date",
  "category",
  "icon",
  "card",
  "bank_account_id",
]);

/** Contrato base: shape + tipos + invariantes numéricos. */
function assertContract(
  data: OkData,
  expectedN: number,
  expectedSource: number,
  opts: { mode?: "divide" | "fixed" } = {},
) {
  const mode = opts.mode ?? "divide";

  // --- normalized: só allowlist, amount saneado ---
  for (const k of Object.keys(data.normalized)) {
    expect(ALLOWED.has(k), `chave ${k} fora do allowlist`).toBe(true);
  }
  if (data.normalized.amount !== undefined) {
    expect(decimalPlaces(data.normalized.amount)).toBeLessThanOrEqual(2);
    expect(round2(data.normalized.amount)).toBe(data.normalized.amount);
  }

  // --- installments: N linhas com numeração 1..N ---
  expect(data.installments).toHaveLength(expectedN);
  const nums = data.installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: expectedN }, (_, i) => i + 1));

  for (const r of data.installments) {
    expect(r.total_installments).toBe(expectedN);
    expect(r.installment_mode).toBe(mode);
    expect(decimalPlaces(r.amount)).toBeLessThanOrEqual(2);
    expect(round2(r.amount)).toBe(r.amount);
    expect(r.amount).toBeGreaterThanOrEqual(0);
    expect(r.installment_source_amount).toBe(round2(expectedSource));
  }

  // --- drift: delta ≤ tolerance, ok=true, sum bate ---
  const sumFromRows = round2(data.installments.reduce((s, r) => s + r.amount, 0));
  expect(data.drift.sum).toBe(sumFromRows);
  expect(data.drift.source).toBe(round2(expectedSource));
  expect(data.drift.tolerance).toBe(round2(expectedN * CENT));
  expect(data.drift.delta).toBeLessThanOrEqual(data.drift.tolerance + 1e-9);
  expect(data.drift.ok).toBe(true);
  // reforço regulamentar
  expect(Math.abs(sumFromRows - round2(expectedSource))).toBeLessThanOrEqual(
    expectedN * CENT + 1e-9,
  );
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
  if (res.status !== 200) {
    throw new Error(`Esperava 200, obteve ${res.status}: ${JSON.stringify(res)}`);
  }
  return res.body.data;
}

describe("Contrato PATCH — arredondamento extremo (drift ≤ N¢)", () => {
  // ------------------- C-A: sub-centavo -------------------
  it.each([
    { amount: 0.001, N: 1 },
    { amount: 0.004, N: 3 },
    { amount: 0.005, N: 5 },
    { amount: 0.009, N: 12 },
    { amount: 0.0049, N: 7 },
  ])("sub-cent amount=$amount, N=$N cumpre contrato", async ({ amount, N }) => {
    const data = await patchOk({ amount, total_installments: N });
    const expectedSource = round2(round2(amount) * N);
    assertContract(data, N, expectedSource);
  });

  // ---------------- C-B: fronteiras half-up ----------------
  it.each([
    { amount: 1.005, N: 1 },
    { amount: 2.675, N: 1 },
    { amount: 0.015, N: 3 },
    { amount: 0.025, N: 5 },
    { amount: 12.065, N: 12 },
    { amount: 999.995, N: 7 },
  ])("half-up amount=$amount, N=$N cumpre contrato", async ({ amount, N }) => {
    const data = await patchOk({ amount, total_installments: N });
    assertContract(data, N, round2(round2(amount) * N));
  });

  // -------------------- C-C: dízimas --------------------
  it.each([
    { amount: 100, N: 3 }, // 33.33 × 3 = 99.99 → drift 1¢
    { amount: 100, N: 6 }, // 16.67 × 6 = 100.02 → drift 2¢
    { amount: 100, N: 7 }, // 14.29 × 7 = 100.03 → drift 3¢
    { amount: 100, N: 9 }, // 11.11 × 9 = 99.99 → drift 1¢
    { amount: 1, N: 3 },
    { amount: 1, N: 6 },
    { amount: 1, N: 7 },
    { amount: 10, N: 9 },
    { amount: 1000, N: 7 },
  ])("dízima amount=$amount, N=$N cumpre contrato", async ({ amount, N }) => {
    const data = await patchOk({ amount, total_installments: N });
    assertContract(data, N, round2(amount * N));
    // drift EXPLICITAMENTE dentro de N¢
    const diffCents = Math.round(Math.abs(data.drift.sum - data.drift.source) * 100);
    expect(diffCents).toBeLessThanOrEqual(N);
  });

  // ---------------- C-D: valores altos com fração ----------------
  it.each([
    { amount: 9_999_999.99, N: 12 },
    { amount: 1_234_567.89, N: 7 },
    { amount: 1_000_000, N: 3 },
    { amount: 500_000.55, N: 24 },
  ])("alto amount=$amount, N=$N cumpre contrato e mantém 2 casas", async ({ amount, N }) => {
    const data = await patchOk({ amount, total_installments: N });
    assertContract(data, N, round2(amount * N));
  });

  // ---------------- C-E: precisão fantasma de float ----------------
  it("float phantom 0.1+0.2 → normalized.amount === 0.3 e contrato ok", async () => {
    const ghost = 0.1 + 0.2;
    const data = await patchOk({ amount: ghost, total_installments: 3 });
    expect(data.normalized.amount).toBe(0.3);
    assertContract(data, 3, round2(0.3 * 3));
  });

  // ---------------- C-F: fixed mode — drift zero ----------------
  it.each([
    { parcela: 0.07, N: 7 },
    { parcela: 33.33, N: 3 },
    { parcela: 83.33, N: 12 },
    { parcela: 0.01, N: 12 },
  ])("fixed parcela=$parcela × N=$N ⇒ drift 0 e contrato ok", async ({ parcela, N }) => {
    const data = await patchOk(
      { amount: parcela },
      { amount: parcela, total_installments: N, installment_mode: "fixed" },
    );
    assertContract(data, N, round2(parcela * N), { mode: "fixed" });
    // fixed => soma exata
    expect(data.drift.delta).toBe(0);
    expect(data.drift.sum).toBe(round2(parcela * N));
  });

  // ---------------- C-G: idempotência do contrato ----------------
  it.each([
    { amount: 100, N: 3 },
    { amount: 100, N: 7 },
    { amount: 999.99, N: 12 },
    { amount: 0.05, N: 5 },
  ])("idempotência: dois PATCHes idênticos produzem o MESMO contrato ($amount / $N)", async ({ amount, N }) => {
    const a = await patchOk({ amount, total_installments: N });
    const b = await patchOk({ amount, total_installments: N });
    expect(b.normalized).toEqual(a.normalized);
    expect(b.installments).toEqual(a.installments);
    expect(b.drift).toEqual(a.drift);
  });

  // ---------------- C-H: patch parcial só de N (merge com currentRow) ----------------
  it("patch parcial só de total_installments preserva contrato e recalcula parcelas", async () => {
    const data = await patchOk(
      { total_installments: 7 },
      { amount: 33.33, total_installments: 3, installment_mode: "divide", installment_source_amount: 99.99 },
    );
    // amount NÃO deve estar em normalized (não veio no patch)
    expect(data.normalized).not.toHaveProperty("amount");
    // source = installment_source_amount atual (99.99)
    assertContract(data, 7, 99.99);
  });

  // ---------------- C-I: varredura densa N ∈ [1..36] ----------------
  it("varredura densa N ∈ [1..36] com source=100 cumpre contrato em TODOS os N", async () => {
    for (let N = 1; N <= 36; N++) {
      const data = await patchOk({ amount: 100, total_installments: N });
      assertContract(data, N, round2(100 * N));
      const diffCents = Math.round(Math.abs(data.drift.sum - data.drift.source) * 100);
      expect(diffCents).toBeLessThanOrEqual(N);
    }
  });

  // ---------------- C-J: strings/nulls no normalized mantêm shape ----------------
  it("campos cosméticos (trim/null) chegam ao normalized sem quebrar o contrato", async () => {
    const data = await patchOk({
      amount: 100 / 3,
      total_installments: 3,
      name: "  Sorvete  ",
      category: "Alimentação",
      icon: null,
      card: "Nubank",
      bank_account_id: null,
    });
    expect(data.normalized.name).toBe("Sorvete");
    expect(data.normalized.category).toBe("Alimentação");
    expect(data.normalized.icon).toBeNull();
    expect(data.normalized.card).toBe("Nubank");
    expect(data.normalized.bank_account_id).toBeNull();
    expect(data.normalized.amount).toBe(33.33);
    assertContract(data, 3, round2(33.33 * 3));
  });
});
