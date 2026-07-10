/**
 * Fuzz property — PATCH com currencies não-BRL.
 *
 * Combina duas fontes de estresse:
 *   1. `currency` (fora do allowlist) com códigos ISO reais de moedas
 *      não-BRL, símbolos, strings hostis e casos degenerados.
 *   2. `amount` e `total_installments` aleatórios cobrindo:
 *        - inteiros (moedas 0-decimal, ex.: JPY, KRW);
 *        - 2 casas (moedas comuns, ex.: USD, EUR);
 *        - 3 casas (moedas 3-decimal, ex.: KWD, BHD, JOD, TND) — o handler
 *          quantiza para 2 casas via `round2`, mas o drift regulamentar
 *          continua garantido em N¢.
 *        - dízimas patológicas (100/3, 100/7).
 *
 * Propriedades globais que TÊM QUE VALER independentemente da currency:
 *   F1. Handler nunca lança — sempre retorna um shape contratual (200/4xx).
 *   F2. Em 200, `normalized` NUNCA contém `currency` (nem aliases).
 *   F3. Em 200, drift regulamentar |Σparcelas − source| ≤ N × 1¢.
 *   F4. Em 200, `drift.tolerance === N * 0.01` e `drift.ok === true`.
 *   F5. Em 200, `installments` tem N entradas, numeradas 1..N, com ≤ 2 casas.
 *   F6. Em 422 (só currency, sem campos válidos), `persist` NUNCA é chamado.
 *
 * O objetivo é blindar o contrato contra clientes multi-moeda que injetem
 * `currency` (ou aliases) em payloads legítimos — o drift financeiro e o
 * saneamento do allowlist devem permanecer estáveis em ~1k execuções aleatórias.
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { fcAssertWithRepro } from "./helpers/fc-assert";
import { handlePatchTransactionContract } from "@/lib/patch-transaction-contract";

const toCents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Alfabeto de tokens que um cliente pode enviar no campo `currency`
 *  (ou aliases). Inclui ISO real, símbolos, cripto e hostis. */
const currencyArb = fc.oneof(
  fc.constantFrom(
    // 0-decimal
    "JPY", "KRW", "CLP", "VND", "HUF",
    // 2-decimal
    "USD", "EUR", "GBP", "CHF", "MXN", "ARS", "CNY", "CAD", "AUD",
    // 3-decimal
    "JOD", "KWD", "BHD", "TND",
    // metais / FMI
    "XAU", "XAG", "XDR", "XXX",
    // cripto / não-ISO
    "BTC", "ETH", "USDT",
    // hostis / degenerados
    "", " ", "usd", "R$", "REAIS", "ADMIN'; DROP TABLE tx;--",
  ),
  // strings aleatórias curtas cobrindo códigos "desconhecidos"
  fc.string({ minLength: 0, maxLength: 8 }),
);

/** Distribuições de amount por precisão decimal, com dízimas incluídas. */
const amountArb = fc.oneof(
  // inteiros grandes (ex.: JPY, KRW)
  fc.integer({ min: 1, max: 10_000_000 }).map((n) => n),
  // 2 casas típicas
  fc.integer({ min: 1, max: 100_000_00 }).map((c) => c / 100),
  // 3 casas (quantizado a 2 pelo handler)
  fc.integer({ min: 1, max: 1_000_000_000 }).map((c) => c / 1000),
  // dízimas patológicas
  fc.constantFrom(100 / 3, 100 / 6, 100 / 7, 100 / 9, 100 / 11, 100 / 13),
  // sub-cent (será arredondado para 2 casas antes de dividir)
  fc.double({ min: 0.001, max: 0.99, noNaN: true, noDefaultInfinity: true }),
);

const nArb = fc.integer({ min: 1, max: 60 });

/** Aliases comuns que também devem ser bloqueados. */
const currencyAliasKeyArb = fc.constantFrom(
  "currency",
  "currency_code",
  "iso_currency",
  "moeda",
  "moeda_codigo",
);

const ALLOWLIST = new Set([
  "name", "amount", "total_installments", "date",
  "category", "icon", "card", "bank_account_id",
]);

function req(body: unknown) {
  return {
    method: "PATCH",
    id: "fuzz-cur",
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

describe("Fuzz — currencies não-BRL preservam drift e shape do normalized", () => {
  it("F1..F5 — payload multi-moeda com amount+N válidos mantém contrato", async () => {
    await fcAssertWithRepro(
      fc.asyncProperty(currencyArb, currencyAliasKeyArb, amountArb, nArb, async (cur, aliasKey, amount, N) => {
        const bank = makePersist();
        const body: Record<string, unknown> = {
          amount,
          total_installments: N,
          [aliasKey]: cur,
        };
        let res;
        try {
          res = await handlePatchTransactionContract(req(body), {
            persist: bank.persist,
            currentRow: null,
          });
        } catch (e) {
          // F1: handler NUNCA pode lançar.
          throw new Error(`handler threw: ${(e as Error).message}`);
        }

        // amount pós-round2 pode acabar 0 → 422 (positive). Aceitável.
        if (res.status !== 200) {
          expect([400, 404, 405, 415, 422]).toContain(res.status);
          return;
        }

        const { normalized, installments, drift } = res.body.data;

        // F2 — nenhum alias de currency vazou para normalized nem persist.
        for (const k of ["currency", "currency_code", "iso_currency", "moeda", "moeda_codigo"]) {
          expect(normalized).not.toHaveProperty(k);
        }
        for (const k of Object.keys(normalized)) {
          expect(ALLOWLIST.has(k)).toBe(true);
        }
        for (const c of bank.calls) {
          for (const k of Object.keys(c)) expect(ALLOWLIST.has(k)).toBe(true);
        }

        // ─── Q1..Q7 — QUANTIZAÇÃO EXATA de `normalized.amount` ────────────
        // Independentemente da currency (allowlist ou não), amount tem que:
        //   Q1. ser === round2(input.amount) (half-away-from-zero via Math.round).
        //   Q2. ter no máximo 2 casas decimais (representável como inteiro em ¢).
        //   Q3. ser um número finito, não-NaN.
        //   Q4. ser estritamente positivo (Zod rejeita 0/negativo antes).
        //   Q6. ser idempotente sob re-quantização: round2(round2(x)) === round2(x).
        //   Q7. não sofrer drift extra por currency: mesmo input numérico produz
        //       o mesmo normalized.amount independentemente do token de currency.
        const na = normalized.amount as number;
        expect(typeof na).toBe("number");
        expect(Number.isFinite(na)).toBe(true);
        expect(Number.isNaN(na)).toBe(false);              // Q3
        expect(na).toBeGreaterThan(0);                     // Q4
        expect(na).toBe(round2(amount));                   // Q1
        // Q2 — inteiro em ¢ (tolerância de FP).
        const cents = na * 100;
        expect(Math.abs(cents - Math.round(cents))).toBeLessThan(1e-6);
        expect(Math.round(cents)).toBe(toCents(na));
        expect(round2(na)).toBe(na);                       // Q6

        // Q7 — invariância vs currency: mesmo input sem currency dá o mesmo amount.
        const baselineBank = makePersist();
        const baseline = await handlePatchTransactionContract(
          req({ amount, total_installments: N }),
          { persist: baselineBank.persist, currentRow: null },
        );
        if (baseline.status === 200) {
          expect(baseline.body.data.normalized.amount).toBe(na);
        }

        // F5 — numeração / precisão / tamanho.
        expect(installments).toHaveLength(N);
        const nums = installments.map((r) => r.installment_number).sort((a, b) => a - b);
        expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
        for (const r of installments) {
          expect(r.total_installments).toBe(N);
          expect(round2(r.amount)).toBe(r.amount);
          expect(Math.round(r.amount * 100)).toBe(toCents(r.amount));
        }

        // Q8 — source é derivado exatamente de round2(na * N).
        const source = installments[0].installment_source_amount;
        expect(source).toBe(round2(na * N));

        // F3 — drift regulamentar.
        const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
        expect(Math.abs(sumCents - toCents(source))).toBeLessThanOrEqual(N);

        // F4 — métricas do drift no payload de resposta.
        expect(drift.tolerance).toBe(round2(N * 0.01));
        expect(drift.ok).toBe(true);
        expect(toCents(drift.sum)).toBe(sumCents);
      }),
      { numRuns: 400 },
    );
  });

  it("F6 — payload só com currency/aliases (sem amount/N) → 422 sem persistir", async () => {
    await fcAssertWithRepro(
      fc.asyncProperty(
        fc.array(fc.tuple(currencyAliasKeyArb, currencyArb), { minLength: 1, maxLength: 5 }),
        async (pairs) => {
          const bank = makePersist();
          const body: Record<string, unknown> = {};
          for (const [k, v] of pairs) body[k] = v;

          const res = await handlePatchTransactionContract(req(body), {
            persist: bank.persist,
            currentRow: null,
          });
          expect(res.status).toBe(422);
          expect(bank.persist).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 200 },
    );
  });

  it("F1..F5 — currency + patch cosmético válido regenera parcelas a partir do currentRow", async () => {
    await fcAssertWithRepro(
      fc.asyncProperty(
        currencyArb,
        currencyAliasKeyArb,
        amountArb,
        nArb,
        fc.oneof(fc.constant("compras"), fc.constant("alimentação"), fc.constant(null)),
        async (cur, aliasKey, rowAmount, N, category) => {
          const bank = makePersist();
          const body: Record<string, unknown> = { [aliasKey]: cur, category };
          const res = await handlePatchTransactionContract(req(body), {
            persist: bank.persist,
            currentRow: {
              amount: rowAmount,
              total_installments: N,
              installment_source_amount: rowAmount,
              installment_mode: "divide",
            },
          });
          if (res.status !== 200) {
            expect([422]).toContain(res.status);
            return;
          }
          const { normalized, installments } = res.body.data;
          expect(normalized).not.toHaveProperty(aliasKey);
          expect(installments).toHaveLength(N);
          const src = installments[0].installment_source_amount;
          const sum = installments.reduce((s, r) => s + toCents(r.amount), 0);
          expect(Math.abs(sum - toCents(src))).toBeLessThanOrEqual(N);
        },
      ),
      { numRuns: 300 },
    );
  });
});
