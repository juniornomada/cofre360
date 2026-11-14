import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  availablePrincipalCents,
  moneyInput,
  parseBRLMoney,
  quoteRedemption,
  validateRedemptionDraft,
  type RedemptionDraft,
} from "@/lib/investment-redemption";

const investment = {
  invested_amount: 1000, value: 1000,
  current_gross_value: 1018, current_net_value: 1015,
  purchase_date: "2026-08-01", asset_class: "pos_fixado",
};
const draft: RedemptionDraft = {
  mode: "total", principalText: "1000,00",
  date: "2026-11-13", accountId: "mercado-pago",
};

describe("Resgate automático pelo líquido informado no investimento", () => {
  it("registra R$1.015 de entrada e só R$15 como receita, sem pedir valores", () => {
    const result = validateRedemptionDraft(investment, draft, "2026-11-13");
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      principal: 1000, netYield: 15, withheldTax: 0,
      receivedTotal: 1015, isFull: true,
      accountId: "mercado-pago", redemptionDate: "2026-11-13",
    });
    expect(quoteRedemption(investment, "total", "").value).toMatchObject({
      principalCents: 100000, netYieldCents: 1500,
      grossBeforeCents: 101800, netBeforeCents: 101500,
      grossNetDifferenceCents: 300, totalCents: 101500,
      estimated: false,
    });
  });

  it("fecha os três fundos da XP com os valores líquidos realmente atualizados", () => {
    const xp = [
      { invested_amount: 1000, value: 1000, current_gross_value: 1034.69, current_net_value: 1027.34 },
      { invested_amount: 500, value: 500, current_gross_value: 518.22, current_net_value: 514.57 },
      { invested_amount: 500, value: 500, current_gross_value: 517.96, current_net_value: 514.39 },
    ];
    const results = xp.map((item) => quoteRedemption({ ...item, asset_class: "pos_fixado" }, "total", "").value);
    expect(results.every(Boolean)).toBe(true);
    expect(results.reduce((sum, row) => sum + (row?.principalCents ?? 0), 0)).toBe(200000);
    expect(results.reduce((sum, row) => sum + (row?.netYieldCents ?? 0), 0)).toBe(5630);
    expect(results.reduce((sum, row) => sum + (row?.totalCents ?? 0), 0)).toBe(205630);
  });

  it("calcula estimativa proporcional para resgate parcial, exigindo apenas a parte do capital", () => {
    const result = validateRedemptionDraft(investment, {
      ...draft, mode: "partial", principalText: "250,00",
    }, "2026-11-13");
    expect(result.value?.receivedTotal).toBe(253.75);
    expect(result.value?.netYield).toBe(3.75);
    expect(result.value?.isFull).toBe(false);
    expect(quoteRedemption(investment, "partial", "250,00").value?.estimated).toBe(true);
    expect(availablePrincipalCents(investment) - Math.round(result.value!.principal * 100)).toBe(75000);
  });

  it("valida centavos e não muda montantes sem ação explícita", () => {
    expect(parseBRLMoney("R$ 1.000,00")).toBe(100000);
    expect(parseBRLMoney("1000.50")).toBe(100050);
    expect(parseBRLMoney("0,00")).toBe(0);
    expect(parseBRLMoney("123,456")).toBeNull();
    expect(parseBRLMoney("-15")).toBeNull();
    expect(moneyInput(105015)).toBe("1050,15");
    expect(quoteRedemption(investment, "total", "1,00").value?.totalCents).toBe(101500);
  });

  it("não aceita capital maior do que a carteira, parcial integral nem posição zerada", () => {
    expect(validateRedemptionDraft(investment, {...draft,mode:"partial", principalText:"1001,00"}, "2026-11-13").error).toMatch(/capital/i);
    expect(validateRedemptionDraft(investment, {...draft,mode:"partial", principalText:"1000,00"}, "2026-11-13").error).toMatch(/total/i);
    expect(validateRedemptionDraft({...investment,invested_amount:0,value:0},draft,"2026-11-13").error).toMatch(/capital/i);
  });

  it("nunca inventa líquido quando está ausente nem trata prejuízo como ganho", () => {
    expect(quoteRedemption({...investment,current_net_value:null}, "total", "").error).toMatch(/líquido atualizado/i);
    expect(quoteRedemption({...investment,current_net_value:980}, "total", "").error).toMatch(/prejuízo/i);
    expect(quoteRedemption({...investment,asset_class:"cripto"}, "total", "").error).toMatch(/renda fixa/i);
  });

  it("bloqueia data futura, data inexistente, anterior à aplicação e conta ausente", () => {
    expect(validateRedemptionDraft(investment, {...draft,date:"2026-11-14"}, "2026-11-13").error).toMatch(/futuro/i);
    expect(validateRedemptionDraft(investment, {...draft,date:"2026-02-30"}, "2026-11-13").error).toMatch(/data/i);
    expect(validateRedemptionDraft(investment, {...draft,date:"2026-07-01"}, "2026-11-13").error).toMatch(/anterior/i);
    expect(validateRedemptionDraft(investment, {...draft,accountId:""}, "2026-11-13").error).toMatch(/conta/i);
  });
});

describe("Contrato transacional do resgate", () => {
  const migration = readFileSync(resolve(process.cwd(),"supabase/migrations/20261113220041_investment_redemptions_atomic.sql"),"utf8");
  const savedNetGuard = readFileSync(resolve(process.cwd(),"supabase/migrations/20261114015549_redemption_saved_net_guard.sql"),"utf8");
  const invest = readFileSync(resolve(process.cwd(),"src/routes/invest.tsx"),"utf8");
  const dialog = readFileSync(resolve(process.cwd(),"src/components/InvestmentRedemptionDialog.tsx"),"utf8");
  const home = readFileSync(resolve(process.cwd(),"src/routes/home.tsx"),"utf8");
  const transactions = readFileSync(resolve(process.cwd(),"src/routes/transactions.tsx"),"utf8");

  it("atomiza créditos e decremento do capital no mesmo RPC", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("for update;");
    expect(migration).toContain("return v_existing.id;");
    expect(migration).toContain("'investment_movement'");
    expect(migration).toContain("'Receita > Juros'");
    expect(migration).toContain("update public.investments");
    expect(migration).toContain("insert into public.investment_redemptions");
    expect(migration).toContain("grant execute on function public.redeem_investment");
    expect(savedNetGuard).toContain("v_expected_total := round(v_inv.current_net_value * (v_principal / v_before),2)");
    expect(savedNetGuard).toContain("round(v_principal + v_yield,2) <> v_expected_total");
    expect(savedNetGuard).toContain("gross_before,net_before");
    expect(savedNetGuard).toContain("v_inv.current_gross_value,v_inv.current_net_value");
    expect(savedNetGuard).not.toContain("v_expected_total := round(v_inv.current_net_value * v_ratio");
  });
  it("mantém RLS, histórico e exclusão bloqueada para resgatados", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("on delete restrict");
    expect(migration).toContain("for select to authenticated");
    expect(migration).not.toContain("security definer");
    expect(invest).toContain('inv.position_status !== "redeemed"');
    expect(invest).toContain("Resgatados ·");
    expect(invest).toContain('archivedByInvestment.has(editing.id)');
  });
  it("não duplica crédito por repetição de comando", () => {
    expect(invest).toContain('supabase.rpc("redeem_investment"');
    expect(invest).toContain("p_request_id: requestId");
    expect(dialog).toContain("requestIdRef.current || crypto.randomUUID()");
    expect(dialog).toContain("ainda não registrei este resgate");
    expect(dialog).not.toContain("netYieldText");
    expect(dialog).not.toContain('aria-label="Impostos retidos na fonte"');
    expect(dialog).toContain("quoteRedemption(investment, draft.mode, draft.principalText)");
  });
  it("não soma o retorno do capital nas receitas dos relatórios", () => {
    expect(home).toContain('normalizedCategory === "investimentos"');
    expect(transactions).toContain('group === "Investimentos"');
    expect(migration).toContain("'income','investment_movement'");
  });
});
