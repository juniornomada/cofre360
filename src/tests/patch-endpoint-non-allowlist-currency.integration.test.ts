/**
 * Contrato PATCH — moedas fora do allowlist.
 *
 * A tabela `transactions` não possui coluna `currency` (nem `currency_code`,
 * `iso_currency`, etc.). Um cliente que tentar enviar essa informação estará
 * usando um campo FORA DO ALLOWLIST — o handler deve:
 *
 *   1. NUNCA persistir a chave (mass-assignment defense).
 *   2. Quando `currency` for o ÚNICO campo enviado, retornar 422
 *      (EMPTY_PAYLOAD): não há nada válido para atualizar.
 *   3. Quando vier acompanhado de campos válidos (ex.: `amount`),
 *      retornar 200 mas com `normalized` SEM a chave `currency`.
 *   4. Em nenhum dos casos o cálculo de parcelas deve ser afetado
 *      pela currency alegada — o drift regulamentar continua |Σ − src| ≤ N¢.
 *
 * Este contrato blinda o app contra dois tipos de erro real:
 *   - Cliente móvel antigo que anexa `currency: "USD"` em cada PATCH; sem
 *     este guard-rail, a persistência silenciosa criaria colunas fantasmas
 *     ou vazaria informação incorreta em relatórios.
 *   - Ataque de mass-assignment tentando definir currency privilegiada
 *     (`XAU`, `XDR`) para burlar limites por moeda.
 *
 * O teste também confirma que, em respostas 4xx, o estado externo (persist)
 * permanece imutável — snapshot antes ≡ snapshot depois.
 */
import { describe, it, expect, vi } from "vitest";
import { handlePatchTransactionContract } from "@/lib/patch-transaction-contract";

const round2 = (n: number) => Math.round(n * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);

/** Códigos que NÃO fazem parte do domínio da app.
 *  Inclui moedas reais (USD/EUR/JPY), fiduciárias exóticas, metais preciosos
 *  ISO (XAU/XAG), unidades de conta (XDR) e strings arbitrárias/hostis. */
const NON_ALLOWLIST_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "ARS",
  "XAU", // ouro
  "XAG", // prata
  "XDR", // FMI
  "XXX", // sem moeda (ISO 4217)
  "BTC", // cripto (não-ISO)
  "ETH",
  "USDT",
  "",
  " ",
  "usd", // minúsculas
  "brl", // até "brl" é fora — allowlist não contempla currency de forma alguma
  "R$", // símbolo
  "BR", // 2 letras
  "REAIS",
  "ADMIN'; DROP TABLE tx;--", // injeção
];

function req(body: unknown, id = "tx-cur", overrideCT?: string) {
  return {
    method: "PATCH",
    id,
    contentType: overrideCT ?? "application/json",
    rawBody: JSON.stringify(body),
  };
}

/** Fake persist com "banco" observável — expõe snapshot para provar
 *  que uma resposta 4xx NÃO alterou nada externamente. */
function makePersist() {
  const store = new Map<string, Record<string, unknown>>();
  const calls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const persist = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    calls.push({ id, patch: { ...patch } });
    const merged = { id, ...(store.get(id) ?? {}), ...patch };
    store.set(id, merged);
    return merged;
  });
  return {
    persist,
    calls,
    snapshot: () => JSON.stringify([...store.entries()].sort()),
  };
}

describe("Contrato PATCH — currencies fora do allowlist", () => {
  for (const cur of NON_ALLOWLIST_CURRENCIES) {
    it(`currency='${cur}' isolada → 422 EMPTY_PAYLOAD sem persistir`, async () => {
      const bank = makePersist();
      const before = bank.snapshot();
      const res = await handlePatchTransactionContract(req({ currency: cur }), {
        persist: bank.persist,
        currentRow: null,
      });
      expect(res.status).toBe(422);
      if (res.status === 422) {
        // EMPTY_PAYLOAD porque currency é a única chave e ela foi descartada
        // silenciosamente pelo stripToAllowlist.
        expect(res.body.error.code).toBe("EMPTY_PAYLOAD");
      }
      // Nenhuma escrita — persist jamais foi invocado.
      expect(bank.persist).not.toHaveBeenCalled();
      expect(bank.calls).toHaveLength(0);
      expect(bank.snapshot()).toBe(before);
    });

    it(`currency='${cur}' junto com amount+N válidos → 200 sem currency persistida`, async () => {
      const bank = makePersist();
      const res = await handlePatchTransactionContract(
        req({ currency: cur, amount: 100 / 3, total_installments: 12 }),
        { persist: bank.persist, currentRow: null },
      );
      expect(res.status).toBe(200);
      if (res.status !== 200) return;

      // A chave `currency` NÃO aparece em `normalized` (mass-assignment bloqueado).
      expect(res.body.data.normalized).not.toHaveProperty("currency");

      // E também não chegou ao persist.
      const patchCall = bank.calls[0]?.patch ?? {};
      expect(patchCall).not.toHaveProperty("currency");
      // Só campos do allowlist são persistidos.
      expect(Object.keys(patchCall).every((k) =>
        ["name", "amount", "total_installments", "date", "category",
         "icon", "card", "bank_account_id"].includes(k),
      )).toBe(true);

      // O drift regulamentar segue |Σ − src| ≤ N¢ — currency alegada é irrelevante.
      const { installments, drift } = res.body.data;
      const N = installments.length;
      expect(N).toBe(12);
      const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
      expect(Math.abs(sumCents - toCents(installments[0].installment_source_amount)))
        .toBeLessThanOrEqual(N);
      expect(drift.ok).toBe(true);
      expect(drift.tolerance).toBe(round2(N * 0.01));
    });
  }

  it("bag com múltiplas variantes de currency + campo cosmético válido — só cosmético persiste", async () => {
    const bank = makePersist();
    const res = await handlePatchTransactionContract(
      req({
        currency: "USD",
        currency_code: "EUR",
        iso_currency: "JPY",
        moeda: "BRL",
        category: "compras",
      }),
      {
        persist: bank.persist,
        currentRow: {
          amount: 300,
          total_installments: 3,
          installment_mode: "divide",
          installment_source_amount: 300,
        },
      },
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) return;

    // Nenhum alias de currency vazou.
    for (const k of ["currency", "currency_code", "iso_currency", "moeda"]) {
      expect(res.body.data.normalized).not.toHaveProperty(k);
      expect(bank.calls[0].patch).not.toHaveProperty(k);
    }
    // O único campo persistido é o cosmético válido.
    expect(bank.calls[0].patch).toEqual({ category: "compras" });

    // O grupo é regenerado a partir da currentRow — drift preservado.
    const { installments } = res.body.data;
    expect(installments).toHaveLength(3);
    const sumCents = installments.reduce((s, r) => s + toCents(r.amount), 0);
    expect(sumCents).toBe(toCents(300));
  });

  it("bag SÓ com currencies (nenhum campo válido) → 422 e persist intocado", async () => {
    const bank = makePersist();
    const before = bank.snapshot();
    const res = await handlePatchTransactionContract(
      req({ currency: "USD", currency_code: "EUR", iso_currency: "JPY", fx_rate: 5.12 }),
      { persist: bank.persist, currentRow: null },
    );
    expect(res.status).toBe(422);
    if (res.status === 422) {
      expect(res.body.error.code).toBe("EMPTY_PAYLOAD");
    }
    expect(bank.persist).not.toHaveBeenCalled();
    expect(bank.snapshot()).toBe(before);
  });

  it("estado do 'banco' não muda entre snapshots antes/depois de qualquer 4xx", async () => {
    const bank = makePersist();
    // Semeia uma linha para termos algo observável.
    await bank.persist("seed", { amount: 42 });
    const before = bank.snapshot();

    const payloads = NON_ALLOWLIST_CURRENCIES.map((c) => ({ currency: c }));
    for (const p of payloads) {
      const res = await handlePatchTransactionContract(req(p, "tx-cur"), {
        persist: bank.persist,
        currentRow: null,
      });
      expect(res.status).toBe(422);
    }
    // Somente a chamada de seed aparece em calls — nenhuma das PATCH inválidas escreveu.
    expect(bank.calls).toHaveLength(1);
    expect(bank.calls[0]).toEqual({ id: "seed", patch: { amount: 42 } });
    expect(bank.snapshot()).toBe(before);
  });
});
