/**
 * Contrato PATCH — formatos decimais variados com currencies não-BRL.
 *
 * Este teste garante que, INDEPENDENTE da moeda alegada pelo cliente
 * (JPY 0-dec, USD 2-dec, KWD 3-dec, XAU sem escala definida) e do
 * FORMATO do número recebido, o handler:
 *
 *   D1. Rejeita strings com separadores locais ("1.234,56", "1,234.56",
 *       "1 234.56", "R$ 100,00", "USD 100.00", "1.005e0") com 422
 *       — nunca as coage silenciosamente — e não persiste nada.
 *   D2. Aceita `amount: number` em qualquer escala e QUANTIZA para 2 casas
 *       via round2 (contrato interno em BRL/2-decimais).
 *   D3. `normalized.amount` é SEMPRE um number com ≤ 2 casas decimais.
 *   D4. Nenhum alias de currency (`currency`, `currency_code`, `iso_currency`,
 *       `moeda`, `fx_rate`, `scale`, `decimal_places`) vaza para o
 *       `normalized` — o allowlist é o contrato.
 *   D5. Drift regulamentar segue |Σparcelas − source| ≤ N × 1¢ para todos
 *       os cenários 200, mesmo quando a moeda alegada tem 0 ou 3 decimais.
 *
 * A escala de saída é fixa em 2 casas (compatível com BRL) porque a app
 * não modela currency por-linha. Assim, o "normalized" é o ponto de
 * verdade e a currency alegada é ruído descartado.
 */
import { describe, it, expect, vi } from "vitest";
import { handlePatchTransactionContract } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

function req(body: unknown, id = "dec-tx") {
  return {
    method: "PATCH",
    id,
    contentType: "application/json",
    rawBody: JSON.stringify(body),
  };
}

function makePersist() {
  const calls: Array<Record<string, unknown>> = [];
  const persist = vi.fn(async (id: string, p: Record<string, unknown>) => {
    calls.push({ ...p });
    return { id, ...p };
  });
  return { persist, calls };
}

// -----------------------------------------------------------------------------
// D1 — strings monetárias formatadas são REJEITADAS (422), nunca coagidas.
// -----------------------------------------------------------------------------

const STRING_MONEY_FORMATS: Array<{ label: string; value: string }> = [
  { label: "pt-BR agrupador",           value: "1.234,56" },
  { label: "en-US agrupador",           value: "1,234.56" },
  { label: "fr/eu-narrow espaço fino",  value: "1 234,56" },
  { label: "IN indiano",                value: "1,23,456.78" },
  { label: "com prefixo R$",            value: "R$ 100,00" },
  { label: "com prefixo USD",           value: "USD 100.00" },
  { label: "com sufixo EUR",            value: "100,00 EUR" },
  { label: "notação científica",        value: "1.005e2" },
  { label: "hex",                       value: "0x64" },
  { label: "underscore",                value: "1_000.00" },
  { label: "aspas dentro",              value: "\"100.00\"" },
  { label: "com sinal +",               value: "+100.00" },
  { label: "trailing dot",              value: "100." },
  { label: "leading dot",               value: ".99" },
  { label: "vazio",                     value: "" },
  { label: "só separador",              value: "." },
];

const NON_BRL_CURRENCIES = ["USD", "JPY", "KWD", "XAU", "BTC", "XXX"];

describe("PATCH — decimais variados + currencies não-BRL", () => {
  describe("D1 — strings monetárias formatadas são rejeitadas com 422", () => {
    for (const cur of NON_BRL_CURRENCIES) {
      for (const s of STRING_MONEY_FORMATS) {
        it(`[${cur}] amount="${s.value}" (${s.label}) → 422 sem persistir`, async () => {
          const bank = makePersist();
          const res = await handlePatchTransactionContract(
            req({ amount: s.value, total_installments: 3, currency: cur }),
            { persist: bank.persist, currentRow: null },
          );
          expect(res.status).toBe(422);
          if (res.status === 422) {
            expect(res.body.error.code).toMatch(/VALIDATION_ERROR|EMPTY_PAYLOAD/);
          }
          expect(bank.persist).not.toHaveBeenCalled();
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // D2/D3/D5 — numbers em várias escalas: quantização para 2 casas + drift OK.
  // ---------------------------------------------------------------------------
  describe("D2/D3/D5 — numbers em escalas variadas quantizam para 2 casas e preservam drift", () => {
    const NUMERIC_SCENARIOS: Array<{
      label: string;
      amount: number;
      N: number;
      currency: string;
      /** Escala esperada em `normalized.amount` (contrato interno: 2). */
      expectedNormalizedAmount: number;
    }> = [
      // JPY (0 dec) — cliente envia inteiro
      { label: "JPY inteiro",         amount: 1000,          N: 4,  currency: "JPY", expectedNormalizedAmount: 1000 },
      { label: "JPY 1¥",              amount: 1,             N: 1,  currency: "JPY", expectedNormalizedAmount: 1 },
      // USD (2 dec)
      { label: "USD 2 casas",         amount: 199.99,        N: 6,  currency: "USD", expectedNormalizedAmount: 199.99 },
      { label: "USD centavos exatos", amount: 100.00,        N: 3,  currency: "USD", expectedNormalizedAmount: 100 },
      // KWD (3 dec) — QUANTIZA para 2 casas
      { label: "KWD 3 casas ↓",       amount: 1.234,         N: 3,  currency: "KWD", expectedNormalizedAmount: 1.23 },
      { label: "KWD 3 casas ↑",       amount: 1.235,         N: 3,  currency: "KWD", expectedNormalizedAmount: 1.24 },
      { label: "KWD half-up 2.675",   amount: 2.675,         N: 5,  currency: "KWD", expectedNormalizedAmount: round2(2.675) },
      // XAU / metais — sem escala definida, tratamos como number arbitrário
      { label: "XAU 4 casas ↓",       amount: 2050.1234,     N: 12, currency: "XAU", expectedNormalizedAmount: 2050.12 },
      { label: "XAU 4 casas ↑",       amount: 2050.1256,     N: 12, currency: "XAU", expectedNormalizedAmount: 2050.13 },
      // dízimas via divisão explícita — quantização ocorre no round2 do schema
      { label: "100/3 (dízima)",      amount: 100 / 3,       N: 12, currency: "USD", expectedNormalizedAmount: round2(100 / 3) },
      { label: "100/7 (dízima)",      amount: 100 / 7,       N: 7,  currency: "JPY", expectedNormalizedAmount: round2(100 / 7) },
      // float phantom (0.1 + 0.2 = 0.30000000000000004)
      { label: "0.1+0.2 phantom",     amount: 0.1 + 0.2,     N: 3,  currency: "USD", expectedNormalizedAmount: 0.3 },
      // valores grandes
      { label: "milionário",          amount: 1_234_567.89,  N: 24, currency: "USD", expectedNormalizedAmount: 1234567.89 },
      // sub-cent → arredonda para 0.01 (positive), evita 0 (que dispararia 422)
      { label: "sub-cent 0.006",      amount: 0.006,         N: 1,  currency: "USD", expectedNormalizedAmount: 0.01 },
    ];

    for (const s of NUMERIC_SCENARIOS) {
      it(`[${s.currency}] ${s.label} (amount=${s.amount}, N=${s.N}) → normalized escala=2 + drift ≤ N¢`, async () => {
        const bank = makePersist();
        const res = await handlePatchTransactionContract(
          req({ amount: s.amount, total_installments: s.N, currency: s.currency }),
          { persist: bank.persist, currentRow: null },
        );
        expect(res.status).toBe(200);
        if (res.status !== 200) return;

        const { normalized, installments, drift } = res.body.data;

        // D3 — escala do normalized é sempre 2 casas.
        expect(typeof normalized.amount).toBe("number");
        expect(round2(normalized.amount as number)).toBe(normalized.amount);
        expect(normalized.amount).toBe(s.expectedNormalizedAmount);

        // D4 — currency não vazou.
        expect(normalized).not.toHaveProperty("currency");
        for (const call of bank.calls) {
          expect(call).not.toHaveProperty("currency");
        }

        // D5 — drift regulamentar.
        const N = installments.length;
        expect(N).toBe(s.N);
        for (const r of installments) {
          expect(r.total_installments).toBe(N);
          expect(round2(r.amount)).toBe(r.amount);
        }
        const src = installments[0].installment_source_amount;
        const sumCents = installments.reduce((sum, r) => sum + toCents(r.amount), 0);
        expect(Math.abs(sumCents - toCents(src))).toBeLessThanOrEqual(N);
        expect(drift.ok).toBe(true);
        expect(drift.tolerance).toBe(round2(N * 0.01));
      });
    }
  });

  // ---------------------------------------------------------------------------
  // D4 — aliases de currency e metadados FX/escala nunca vazam para normalized.
  // ---------------------------------------------------------------------------
  it("D4 — bag com currency + fx_rate + scale + decimal_places → nada além do allowlist persiste", async () => {
    const bank = makePersist();
    const res = await handlePatchTransactionContract(
      req({
        amount: 1.235,
        total_installments: 4,
        currency: "KWD",
        currency_code: "USD",
        iso_currency: "JPY",
        moeda: "BRL",
        fx_rate: 5.12,
        scale: 3,
        decimal_places: 3,
        exponent: -3,
      }),
      { persist: bank.persist, currentRow: null },
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) return;

    const FORBIDDEN = [
      "currency", "currency_code", "iso_currency", "moeda",
      "fx_rate", "scale", "decimal_places", "exponent",
    ];
    for (const k of FORBIDDEN) {
      expect(res.body.data.normalized).not.toHaveProperty(k);
      expect(bank.calls[0]).not.toHaveProperty(k);
    }
    // normalized.amount quantizado para 2 casas.
    expect(res.body.data.normalized.amount).toBe(1.24);
  });

  // ---------------------------------------------------------------------------
  // Robustez extra: NaN / Infinity via number são rejeitados (positive/finite).
  // ---------------------------------------------------------------------------
  it("números não-finitos (NaN/±Infinity) sob qualquer currency → 422 e sem persistir", async () => {
    const patholog = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0];
    for (const cur of NON_BRL_CURRENCIES) {
      for (const amt of patholog) {
        const bank = makePersist();
        const res = await handlePatchTransactionContract(
          req({ amount: amt, total_installments: 3, currency: cur }),
          { persist: bank.persist, currentRow: null },
        );
        expect(res.status).toBe(422);
        expect(bank.persist).not.toHaveBeenCalled();
      }
    }
  });
});
