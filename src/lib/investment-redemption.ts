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

/** Accept R$ 1.000,00, 1000,00 or 1000.00 without silently rounding. */
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
  /** Only needed to choose the size of a partial redemption. */
  principalText: string;
  date: string;
  accountId: string;
};

type InvestmentQuote = Pick<
  Investment,
  "invested_amount" | "value" | "current_gross_value" | "current_net_value" | "asset_class"
>;

export type RedemptionQuote = {
  principalCents: number;
  netYieldCents: number;
  totalCents: number;
  capitalRemainingCents: number;
  grossBeforeCents: number | null;
  netBeforeCents: number;
  grossNetDifferenceCents: number | null;
  /** Partial redemptions are proportional projections, not the XP settlement. */
  estimated: boolean;
  isFull: boolean;
};

/**
 * Uses the provider's LIQUID value that the user already saved in Investments.
 * It never estimates taxes from the gross/net spread or counts capital as income.
 * For partial redemptions the net credit is a proportional *estimate*.
 */
export function quoteRedemption(
  investment: InvestmentQuote,
  mode: RedemptionMode,
  principalText: string,
): { value?: RedemptionQuote; error?: string } {
  if (!["pos_fixado", "cdb", "tesouro"].includes(String(investment.asset_class))) {
    return { error: "Resgate automático disponível somente para renda fixa e pós-fixados." };
  }
  const availableCents = availablePrincipalCents(investment);
  if (availableCents <= 0) {
    return { error: "Este investimento não tem capital disponível para resgate." };
  }
  if (
    investment.current_net_value == null ||
    !Number.isFinite(Number(investment.current_net_value)) ||
    Number(investment.current_net_value) <= 0
  ) {
    return { error: "Informe o valor líquido atualizado na edição do investimento antes de resgatar." };
  }

  const netBeforeCents = moneyCents(investment.current_net_value);
  const grossBeforeCents = investment.current_gross_value == null
    ? null : moneyCents(investment.current_gross_value);

  if (netBeforeCents < availableCents) {
    return {
      error: "O valor líquido está abaixo do capital aplicado. O fluxo de resgate com prejuízo ainda requer conciliação específica; não é seguro tratá-lo como juros.",
    };
  }

  const principalCents = mode === "total"
    ? availableCents : parseBRLMoney(principalText);

  if (principalCents === null || principalCents <= 0 || principalCents > availableCents) {
    return { error: "Informe um capital válido, sem ultrapassar o saldo investido." };
  }
  if (mode === "partial" && principalCents >= availableCents) {
    return { error: "Para retirar todo o capital, escolha Resgate total." };
  }

  // Integer cents prevent floating-point inconsistencies between screen and RPC.
  const totalCents = mode === "total"
    ? netBeforeCents
    : Math.round((netBeforeCents * principalCents) / availableCents);
  const netYieldCents = totalCents - principalCents;
  return {
    value: {
      principalCents,
      netYieldCents,
      totalCents,
      capitalRemainingCents: availableCents - principalCents,
      grossBeforeCents,
      netBeforeCents,
      grossNetDifferenceCents: grossBeforeCents === null
        ? null : Math.max(0, grossBeforeCents - netBeforeCents),
      estimated: mode === "partial",
      isFull: principalCents === availableCents,
    },
  };
}

export type ValidatedRedemption = {
  principal: number;
  netYield: number;
  withheldTax: number;
  receivedTotal: number;
  isFull: boolean;
  accountId: string;
  redemptionDate: string;
};

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateRedemptionDraft(
  investment: InvestmentQuote & Pick<Investment, "purchase_date">,
  draft: RedemptionDraft,
  today = todayBrazil(),
): { value?: ValidatedRedemption; error?: string } {
  const quote = quoteRedemption(investment, draft.mode, draft.principalText);
  if (quote.error || !quote.value) return { error: quote.error ?? "Resgate inválido." };
  if (!draft.accountId) return { error: "Selecione a conta que recebeu o resgate." };
  if (!isValidIsoDate(draft.date)) {
    return { error: "Informe a data do crédito na conta." };
  }
  if (draft.date > today) return { error: "A data do crédito não pode estar no futuro." };
  if (investment.purchase_date && draft.date < investment.purchase_date) {
    return { error: "O crédito não pode ser anterior à aplicação." };
  }
  return {
    value: {
      principal: quote.value.principalCents / 100,
      netYield: quote.value.netYieldCents / 100,
      // Gross-minus-net can include fees; do not incorrectly label it IR/IOF.
      withheldTax: 0,
      receivedTotal: quote.value.totalCents / 100,
      isFull: quote.value.isFull,
      accountId: draft.accountId,
      redemptionDate: draft.date,
    },
  };
}
