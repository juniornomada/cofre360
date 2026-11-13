import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  availablePrincipalCents,
  moneyInput,
  parseBRLMoney,
  validateRedemptionDraft,
  type RedemptionDraft,
} from "@/lib/investment-redemption";

const investment = {
  invested_amount: 1000, value: 1000,
  purchase_date: "2026-08-01", asset_class: "pos_fixado",
};
const draft: RedemptionDraft = {
  mode: "total", principalText: "1000,00",
  netYieldText: "15,00", taxText: "3,00",
  date: "2026-11-13", accountId: "mercado-pago",
};

describe("Resgate de investimentos — validacao de valores", () => {
  it("concilia R$1.000 de capital com R$15 de juros liquidos sem cobrar imposto duas vezes", () => {
    const result = validateRedemptionDraft(investment, draft, "2026-11-13");
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      principal: 1000, netYield: 15, withheldTax: 3,
      receivedTotal: 1015, isFull: true,
      accountId: "mercado-pago", redemptionDate: "2026-11-13",
    });
  });
  it("permite resgate parcial com posicao remanescente", () => {
    const result = validateRedemptionDraft(investment, {
      ...draft, mode: "partial", principalText: "250,00", netYieldText: "4,75",
    }, "2026-11-13");
    expect(result.value?.receivedTotal).toBe(254.75);
    expect(result.value?.isFull).toBe(false);
    expect(availablePrincipalCents(investment) - Math.round(result.value!.principal * 100)).toBe(75000);
  });
  it("interpreta moeda brasileira sem arredondar erros silenciosamente", () => {
    expect(parseBRLMoney("R$ 1.000,00")).toBe(100000);
    expect(parseBRLMoney("1000.50")).toBe(100050);
    expect(parseBRLMoney("0,00")).toBe(0);
    expect(parseBRLMoney("123,456")).toBeNull();
    expect(parseBRLMoney("-15")).toBeNull();
    expect(moneyInput(105015)).toBe("1050,15");
  });
  it("bloqueia valor maior que saldo, zero e resgate parcial com capital integral", () => {
    expect(validateRedemptionDraft(investment, {...draft, mode:"partial", principalText:"1001,00"}, "2026-11-13").error)
      .toMatch(/capital/i);
    expect(validateRedemptionDraft(investment, {...draft, mode:"partial", principalText:"1000,00"}, "2026-11-13").error)
      .toMatch(/total/i);
    expect(validateRedemptionDraft({...investment,invested_amount:0,value:0}, draft, "2026-11-13").error)
      .toMatch(/capital/i);
  });
  it("bloqueia data no futuro, anterior a aplicacao, conta ausente e classes sem suporte", () => {
    expect(validateRedemptionDraft(investment, {...draft,date:"2026-11-14"}, "2026-11-13").error)
      .toMatch(/futuro/i);
    expect(validateRedemptionDraft(investment, {...draft,date:"2026-07-01"}, "2026-11-13").error)
      .toMatch(/anterior/i);
    expect(validateRedemptionDraft(investment, {...draft,accountId:""}, "2026-11-13").error)
      .toMatch(/conta/i);
    expect(validateRedemptionDraft({...investment,asset_class:"cripto"}, draft, "2026-11-13").error)
      .toMatch(/renda fixa/i);
  });
  it("rejeita valores e impostos invalidos sem salvar", () => {
    expect(validateRedemptionDraft(investment, {...draft,netYieldText:"-1"}, "2026-11-13").error)
      .toMatch(/casas/i);
    expect(validateRedemptionDraft(investment, {...draft,taxText:"1,234"}, "2026-11-13").error)
      .toMatch(/casas/i);
  });
});

describe("Contrato transacional do resgate", () => {
  const migration = readFileSync(resolve(process.cwd(),"supabase/migrations/20261113215000_investment_redemptions_atomic.sql"),"utf8");
  const invest = readFileSync(resolve(process.cwd(),"src/routes/invest.tsx"),"utf8");
  const dialog = readFileSync(resolve(process.cwd(),"src/components/InvestmentRedemptionDialog.tsx"),"utf8");
  const home = readFileSync(resolve(process.cwd(),"src/routes/home.tsx"),"utf8");
  const transactions = readFileSync(resolve(process.cwd(),"src/routes/transactions.tsx"),"utf8");

  it("atomiza creditos e decremento do capital no mesmo RPC", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("for update;");
    expect(migration).toContain("return v_existing.id;");
    expect(migration).toContain("'investment_movement'");
    expect(migration).toContain("'Receita > Juros'");
    expect(migration).toContain("update public.investments");
    expect(migration).toContain("insert into public.investment_redemptions");
    expect(migration).toContain("grant execute on function public.redeem_investment");
  });
  it("mantem RLS, historico auditavel e exclusao bloqueada para resgatados", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("on delete restrict");
    expect(migration).toContain("for select to authenticated");
    expect(migration).not.toContain("security definer");
    expect(invest).toContain('inv.position_status !== "redeemed"');
    expect(invest).toContain("Resgatados ·");
    expect(invest).toContain('archivedByInvestment.has(editing.id)');
  });
  it("nao registra duas vezes ao reabrir a pagina ou repetir a mesma solicitacao", () => {
    expect(invest).toContain('supabase.rpc("redeem_investment"');
    expect(invest).toContain("p_request_id: requestId");
    expect(dialog).toContain("requestIdRef.current || crypto.randomUUID()");
    expect(dialog).not.toContain("Envio automático");
    expect(dialog).toContain("ainda não registrei este resgate");
  });
  it("exclui retorno de capital da receita dos relatorios, sem afetar saldo das contas", () => {
    expect(home).toContain('normalizedCategory === "investimentos"');
    expect(transactions).toContain('group === "Investimentos"');
    expect(migration).toContain("'income','investment_movement'");
  });
});
