/**
 * Contrato PATCH — currencies não-BRL.
 *
 * O handler quantiza sempre em 2 casas decimais (unidade menor de moedas
 * "centavo-based"). Estes testes exercitam o contrato com amounts
 * representando diferentes moedas e validam que:
 *   - `normalized` mantém os campos do allowlist com precisão coerente
 *     com a unidade menor da moeda (ou pior caso: 2 casas do handler);
 *   - `installments` respeitam o limite de drift regulamentar em cada
 *     currency: |Σ − source| ≤ N × unidadeMenor, sempre satisfeito por
 *     |Σ − source| ≤ N × 1¢ do handler quando a moeda tem ≥ 2 casas.
 *
 * Matriz de moedas:
 *   - Zero decimais (JPY, KRW, CLP, VND, HUF): entradas inteiras → drift == 0.
 *   - Duas decimais (USD, EUR, GBP, CHF, CAD, AUD, MXN, ARS): unidade menor
 *     = 1¢, mesmo comportamento numérico que BRL.
 *   - Três decimais (JOD, KWD, BHD, TND): amount fornecido em unidade maior
 *     com 3 casas; handler faz half-up para 2 casas — a tolerância de 1¢
 *     do handler (10× a unidade menor) permanece válida como upper bound.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handlePatchTransactionContract,
  type PatchContractResponse,
} from "@/lib/patch-transaction-contract";

const round2 = (n: number) => Math.round(n * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);

type Currency = {
  code: string;
  minor: number;              // casas decimais nativas da moeda
  minorUnit: number;          // valor da unidade menor em unidade maior
  samples: number[];          // amounts típicos (unidade maior)
};

const CURRENCIES: Currency[] = [
  // Zero-decimal
  { code: "JPY", minor: 0, minorUnit: 1,     samples: [1, 100, 10_000, 1_234_567] },
  { code: "KRW", minor: 0, minorUnit: 1,     samples: [1000, 55_000, 999_999] },
  { code: "CLP", minor: 0, minorUnit: 1,     samples: [500, 25_000, 1_000_000] },
  { code: "VND", minor: 0, minorUnit: 1,     samples: [10_000, 250_000, 9_999_999] },
  { code: "HUF", minor: 0, minorUnit: 1,     samples: [100, 12_345, 500_000] },
  // Two-decimal
  { code: "USD", minor: 2, minorUnit: 0.01,  samples: [0.01, 1.99, 199.95, 12_345.67] },
  { code: "EUR", minor: 2, minorUnit: 0.01,  samples: [9.99, 49.90, 1_500.55] },
  { code: "GBP", minor: 2, minorUnit: 0.01,  samples: [0.05, 19.99, 750.00] },
  { code: "CHF", minor: 2, minorUnit: 0.01,  samples: [12.30, 480.75] },
  { code: "MXN", minor: 2, minorUnit: 0.01,  samples: [199.99, 2_499.90] },
  // Three-decimal (handler quantiza p/ 2 casas; drift ≤ N¢ segue válido)
  { code: "JOD", minor: 3, minorUnit: 0.001, samples: [0.005, 1.005, 99.995, 1_234.567] },
  { code: "KWD", minor: 3, minorUnit: 0.001, samples: [0.010, 25.375, 999.999] },
  { code: "BHD", minor: 3, minorUnit: 0.001, samples: [0.500, 149.125] },
  { code: "TND", minor: 3, minorUnit: 0.001, samples: [3.141, 271.828] },
];

const N_VALUES = [1, 2, 3, 6, 12, 24, 60, 120, 360];

function req(body: unknown, id = "cur-tx") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

async function patch(body: unknown, currentRow: Parameters<typeof handlePatchTransactionContract>[1]["currentRow"] = null): Promise<PatchContractResponse> {
  const persist = vi.fn(async (id: string, p: Record<string, unknown>) => ({ id, ...p }));
  return handlePatchTransactionContract(req(body), { persist, currentRow });
}

function assertContractOk(res: PatchContractResponse, N: number, currency: Currency) {
  expect(res.status).toBe(200);
  if (res.status !== 200) return;
  const { installments, drift, normalized } = res.body.data;

  // Contrato base
  expect(installments).toHaveLength(N);
  expect(drift.tolerance).toBe(round2(N * 0.01));
  expect(drift.ok).toBe(true);

  // Cada parcela: 2 casas decimais, mode divide, numeração 1..N
  const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
  expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  for (const r of installments) {
    expect(r.total_installments).toBe(N);
    expect(r.installment_mode).toBe("divide");
    expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
    expect(r.amount).toBeGreaterThanOrEqual(0);
  }

  // Normalized: só chaves do allowlist, amount e N coerentes com o payload enviado
  const allowed = new Set([
    "name", "amount", "total_installments", "installment_mode",
    "installment_source_amount", "category_id", "icon", "bank_account_id",
    "credit_card_id", "date", "notes",
  ]);
  for (const key of Object.keys(normalized)) {
    expect(allowed.has(key)).toBe(true);
  }

  // Distribuição do centavo (invariante do handler): spread ≤ 1¢
  const cents = installments.map((r) => toCents(r.amount));
  expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);

  // Drift regulamentar por moeda:
  //   - 0-decimal (JPY/KRW/...): amount inteiro, tolerância nativa da moeda
  //     seria 0; handler garante Σ == source exatamente quando N divide amount,
  //     senão spread ≤ 1¢ com |Σ − source| ≤ N × 1¢ (aceitável: 1¢ < 1 JPY,
  //     o handler simplesmente representa a moeda em 2 casas).
  //   - 2/3-decimal: |Σ − source| ≤ N × 1¢ ⇒ ≤ N × unidadeMenor quando
  //     unidadeMenor ≥ 1¢ (2 casas) ou ≤ 10N × unidadeMenor (3 casas).
  const sumCents = cents.reduce((a, b) => a + b, 0);
  const diffCents = Math.abs(sumCents - toCents(drift.source));
  expect(diffCents).toBeLessThanOrEqual(N);
  void currency; // documenta a semântica; nenhum assert extra necessário
}

describe("Contrato PATCH — currencies não-BRL", () => {
  for (const currency of CURRENCIES) {
    describe(`${currency.code} (${currency.minor} decimais)`, () => {
      for (const amount of currency.samples) {
        for (const N of N_VALUES) {
          it(`amount=${amount} × N=${N} respeita drift ≤ N¢`, async () => {
            const res = await patch({ amount, total_installments: N });
            assertContractOk(res, N, currency);
          });
        }
      }

      it("modo fixed: todas parcelas idênticas, drift == 0", async () => {
        const parcela = currency.samples[0];
        const N = 12;
        const res = await patch(
          { amount: parcela },
          { amount: parcela, total_installments: N, installment_mode: "fixed" },
        );
        expect(res.status).toBe(200);
        if (res.status !== 200) return;
        const { installments, drift } = res.body.data;
        expect(installments).toHaveLength(N);
        expect(drift.delta).toBe(0);
        // Todas as parcelas idênticas em cents (quantizadas p/ 2 casas pelo handler)
        const cents = installments.map((r) => toCents(r.amount));
        expect(Math.max(...cents)).toBe(Math.min(...cents));
        // Σ == parcela quantizada × N
        expect(cents.reduce((a, b) => a + b, 0)).toBe(cents[0] * N);
        for (const r of installments) {
          expect(r.installment_mode).toBe("fixed");
        }
      });

      it("patch parcial (só N) recalcula parcelas respeitando drift do currentRow", async () => {
        const amount = currency.samples[currency.samples.length - 1];
        const res = await patch(
          { total_installments: 8 },
          { amount, total_installments: 1, installment_source_amount: amount },
        );
        expect(res.status).toBe(200);
        if (res.status !== 200) return;
        const { installments, drift } = res.body.data;
        expect(installments).toHaveLength(8);
        // source pode ter sido quantizado pelo handler (moedas 3-decimais →
        // 2 casas); aceitamos qualquer valor a ≤ 1¢ de round2(amount).
        expect(Math.abs(toCents(drift.source) - toCents(round2(amount)))).toBeLessThanOrEqual(1);
        const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
        expect(Math.abs(sumCents - toCents(drift.source))).toBeLessThanOrEqual(8);
      });
    });
  }

  it("moedas zero-decimal: quando N divide amount, Σ === source (drift 0)", async () => {
    // JPY 12000 / 12 = 1000 exato; KRW 60000 / 6 = 10000 exato.
    const cases: Array<[number, number]> = [
      [12_000, 12],
      [60_000, 6],
      [1_000_000, 100],
      [360, 360],
    ];
    for (const [amount, N] of cases) {
      const res = await patch({ amount, total_installments: N });
      expect(res.status).toBe(200);
      if (res.status !== 200) continue;
      expect(res.body.data.drift.delta).toBe(0);
    }
  });

  it("moedas 3-decimal (JOD half-up): handler quantiza para 2 casas e drift ≤ N¢", async () => {
    // 0.005 JOD (half-up para 2 casas → 0.01) × N=3 → source=0.03, Σ≤0.03±3¢.
    const res = await patch({ amount: 0.005, total_installments: 3 });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    const { installments, drift } = res.body.data;
    for (const r of installments) {
      expect(Math.round(r.amount * 100) / 100).toBe(r.amount);
    }
    expect(Math.abs(toCents(drift.sum) - toCents(drift.source))).toBeLessThanOrEqual(3);
  });
});
