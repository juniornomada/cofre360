import type { Investment } from "@/lib/investments-calc";

export type RedemptionMode = "total" | "partial";

export function moneyCents(value: number | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function availablePrincipalCents(
  investment: Pick<Investment, "invested_amount" | "value">,
): number {
  return moneyCents(investment.invested_amount ?? investment.value);
}

/** Accept R$ 1.000,00, 1000,00 or 1000.00 without rounding silently. */
export function parseBRLMoney(input: string): number | null {
  const sanitized = input.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (!sanitized || !/^\d[\d.,]*$/.test(sanitized)) return null;
  const normalized = sanitized.includes(",")
    ? sanitized.replace(/\./g, "").replace(",", ".")
    : sanitized;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount > 999999999999 || amount < 0) return null;
  return Math.round(amount * 100);
}

export function moneyInput(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2).replace(".", ",");
}

export function todayBrazil(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return [pick("year"), pick("month"), pick("day")].join("-");
}

export type RedemptionDraft = {
  mode: RedemptionMode;
  principalText: string;
  netYieldText: string;
  taxText: string;
  date: string;
  accountId: string;
};

export type ValidatedRedemption = {
  principal: number;
  netYield: number;
  withheldTax: number;
  receivedTotal: number;
  isFull: boolean;
  accountId: string;
  redemptionDate: string;
};

export function validateRedemptionDraft(
  investment: Pick<Investment, "invested_amount" | "value" | "purchase_date" | "asset_class">,
  draft: RedemptionDraft,
  today = todayBrazil(),
): { value?: ValidatedRedemption; error?: string } {
  const allowed = ["pos_fixado", "cdb", "tesouro"];
  if (!allowed.includes(String(investment.asset_class))) {
    return { error: "Resgate automático disponível somente para renda fixa e pós-fixados." };
  }
  const remaining = availablePrincipalCents(investment);
  const principal = draft.mode === "total" ? remaining : parseBRLMoney(draft.principalText);
  const yieldCents = parseBRLMoney(draft.netYieldText);
  const taxes = parseBRLMoney(draft.taxText);
  if (principal === null || principal <= 0 || principal > remaining || remaining <= 0) {
    return { error: "Informe um capital válido, sem ultrapassar o saldo investido." };
  }
  if (draft.mode === "partial" && principal >= remaining) {
    return { error: "Para retirar todo o capital, escolha Resgate total." };
  }
  if (yieldCents === null || taxes === null) {
    return { error: "Rendimento e impostos devem ter até duas casas decimais." };
  }
  if (!draft.accountId) return { error: "Selecione a conta que recebeu o resgate." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date + "T12:00:00"))) {
    return { error: "Informe a data do crédito na conta." };
  }
  if (draft.date > today) return { error: "A data do crédito não pode estar no futuro." };
  if (investment.purchase_date && draft.date < investment.purchase_date) {
    return { error: "O crédito não pode ser anterior à aplicação." };
  }
  return {
    value: {
      principal: principal / 100,
      netYield: yieldCents / 100,
      withheldTax: taxes / 100,
      receivedTotal: (principal + yieldCents) / 100,
      isFull: principal === remaining,
      accountId: draft.accountId,
      redemptionDate: draft.date,
    },
  };
}
