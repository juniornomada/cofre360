// Pure helpers for investment calculations.
// IR regressivo (Tesouro e CDB) e valor líquido projetado.

export type AssetClass =
  | "tesouro"
  | "cripto"
  | "cdb"
  | "acao"
  | "fii"
  | "etf"
  | "pos_fixado"
  | "alternativos"
  | "renda_variavel_global"
  | "renda_variavel_brasil"
  | "outro";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  tesouro: "Tesouro Direto",
  cripto: "Criptomoeda",
  cdb: "CDB",
  acao: "Ações",
  fii: "Fundo Imobiliário",
  etf: "ETF",
  pos_fixado: "Pós-Fixado",
  alternativos: "Alternativos",
  renda_variavel_global: "Renda Variável Global",
  renda_variavel_brasil: "Renda Variável Brasil",
  outro: "Outro",
};

/** IR regressivo da renda fixa (Tesouro e CDB). */
export function irRateForDays(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

/** IOF regressivo sobre o ganho bruto, somente para resgate antes de 30 dias. */
const IOF_PERCENT_BY_DAY = [
  0, 96, 93, 90, 86, 83, 80, 76, 73, 70, 66,
  63, 60, 56, 53, 50, 46, 43, 40, 36, 33,
  30, 26, 23, 20, 16, 13, 10, 6, 3,
] as const;

export function iofRateForDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0 || days >= 30) return 0;
  return (IOF_PERCENT_BY_DAY[Math.floor(days)] ?? 0) / 100;
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export function yearsBetween(a: Date, b: Date): number {
  return daysBetween(a, b) / 365;
}

export interface Investment {
  id: string;
  name: string;
  icon: string;
  color?: string | null;
  value: number;
  change: number;
  type: string;
  asset_class: AssetClass | string | null;
  asset_code: string | null;
  quantity: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  admin_fee: number | null;
  yield_rate: number | null;
  maturity_date: string | null;
  current_price: number | null;
  last_quote_at: string | null;
  invested_amount?: number | null;
  current_gross_value?: number | null;
  current_net_value?: number | null;
  risk_level?: string | null;
  risk_score?: number | null;
  redemption_quote?: string | null;
  redemption_settlement?: string | null;
  last_manual_update?: string | null;
}

export interface ValuationResult {
  /** Valor de mercado bruto (sem impostos). */
  grossValue: number;
  /** Valor investido (custo). */
  invested: number;
  /** Lucro/prejuízo bruto. */
  grossPnL: number;
  /** % variação sobre o custo. */
  pctChange: number;
  /** IR estimado sobre o lucro (apenas renda fixa / quando aplicável). */
  estimatedTax: number;
  /** IOF estimado sobre ganhos em resgate dentro de 30 dias. */
  estimatedIOF: number;
  /** Taxa de administração descontada. */
  estimatedAdminFee: number;
  /** Indica se o valor líquido foi informado ou tem tributos conhecidos calculáveis. */
  netEstimateComplete: boolean;
  /** Valor líquido após IR e taxa adm. */
  netValue: number;
  /** Data usada na valoração (string ISO). */
  asOf: string;
}

function fixedIncomeDeductions(
  cls: string,
  purchaseDate: string | null,
  targetDate: Date,
  grossValue: number,
  invested: number,
  adminFeePercent: number | null,
) {
  if ((cls !== "tesouro" && cls !== "cdb") || !purchaseDate) return null;
  const purchase = new Date(purchaseDate);
  if (!Number.isFinite(purchase.getTime()) || purchase.getTime() > targetDate.getTime()) return null;

  const days = daysBetween(purchase, targetDate);
  const years = yearsBetween(purchase, targetDate);
  const grossGain = Math.max(0, grossValue - invested);
  const estimatedIOF = grossGain * iofRateForDays(days);
  // IOF is deducted from the yield before the IR taxable base is calculated.
  const estimatedTax = Math.max(0, grossGain - estimatedIOF) * irRateForDays(days);
  const adminRate = Math.max(0, Number(adminFeePercent) || 0);
  const estimatedAdminFee = grossValue * (adminRate / 100) * years;
  return { estimatedIOF, estimatedTax, estimatedAdminFee };
}

/**
 * Calcula valoração atual / projetada de um investimento.
 * Prioridade: valores manuais atuais > cotação automática > cálculo legado.
 */
export function valuate(inv: Investment, targetDate: Date = new Date()): ValuationResult {
  const asOf = targetDate.toISOString();
  const cls = (inv.asset_class || "").toLowerCase();
  const manualInvested = inv.invested_amount != null ? Number(inv.invested_amount) : Number(inv.value) || 0;

  // Valor manual informado pelo usuário é a fonte principal para fundos e demais
  // investimentos acompanhados diretamente pelo saldo da instituição.
  if (inv.current_gross_value != null) {
    const invested = manualInvested;
    const grossValue = Number(inv.current_gross_value) || 0;
    const hasManualNet = inv.current_net_value != null;
    // An explicitly supplied net balance from the provider takes precedence.
    // A difference between two manually supplied values must not be mislabeled as IR.
    const deductions = !hasManualNet
      ? fixedIncomeDeductions(cls, inv.purchase_date, targetDate, grossValue, invested, inv.admin_fee)
      : null;
    const netValue = hasManualNet
      ? Number(inv.current_net_value)
      : grossValue - (deductions?.estimatedIOF ?? 0) - (deductions?.estimatedTax ?? 0) - (deductions?.estimatedAdminFee ?? 0);
    const grossPnL = grossValue - invested;
    return {
      grossValue,
      invested,
      grossPnL,
      pctChange: invested > 0 ? (grossPnL / invested) * 100 : 0,
      estimatedTax: deductions?.estimatedTax ?? 0,
      estimatedIOF: deductions?.estimatedIOF ?? 0,
      estimatedAdminFee: deductions?.estimatedAdminFee ?? 0,
      netEstimateComplete: hasManualNet || deductions !== null,
      netValue,
      asOf,
    };
  }

  // Renda variável: marca a mercado
  if (cls === "cripto" || cls === "acao" || cls === "fii" || cls === "etf") {
    const qty = Number(inv.quantity) || 0;
    const px = Number(inv.current_price) || Number(inv.purchase_price) || 0;
    const buy = Number(inv.purchase_price) || 0;
    const invested = manualInvested || qty * buy;
    const grossValue = qty * px || invested;
    const grossPnL = grossValue - invested;
    return {
      grossValue,
      invested,
      grossPnL,
      pctChange: invested > 0 ? (grossPnL / invested) * 100 : 0,
      estimatedTax: 0,
      estimatedIOF: 0,
      estimatedAdminFee: 0,
      netEstimateComplete: false, // taxes on sale cannot be inferred from asset class alone
      netValue: grossValue,
      asOf,
    };
  }

  // Renda fixa: Tesouro / CDB com yield_rate
  if ((cls === "tesouro" || cls === "cdb") && inv.purchase_date && inv.yield_rate != null) {
    const purchase = new Date(inv.purchase_date);
    const principal = manualInvested || (Number(inv.quantity) * Number(inv.purchase_price)) || 0;
    const ratePct = Number(inv.yield_rate) || 0;
    const adminPct = Number(inv.admin_fee) || 0;
    const years = Math.max(0, yearsBetween(purchase, targetDate));
    const grossValue = principal * Math.pow(1 + ratePct / 100, years);
    const grossPnL = grossValue - principal;
    const deductions = fixedIncomeDeductions(cls, inv.purchase_date, targetDate, grossValue, principal, adminPct);
    const estimatedIOF = deductions?.estimatedIOF ?? 0;
    const estimatedTax = deductions?.estimatedTax ?? 0;
    const estimatedAdminFee = deductions?.estimatedAdminFee ?? 0;
    const netValue = grossValue - estimatedAdminFee - estimatedIOF - estimatedTax;
    return {
      grossValue,
      invested: principal,
      grossPnL,
      pctChange: principal > 0 ? (grossPnL / principal) * 100 : 0,
      estimatedTax,
      estimatedIOF,
      estimatedAdminFee,
      netEstimateComplete: deductions !== null,
      netValue,
      asOf,
    };
  }

  // Fallback legado: usa value + change%.
  const invested = manualInvested;
  const pct = Number(inv.change) || 0;
  const grossValue = invested * (1 + pct / 100);
  return {
    grossValue,
    invested,
    grossPnL: grossValue - invested,
    pctChange: pct,
    estimatedTax: 0,
    estimatedIOF: 0,
    estimatedAdminFee: 0,
    netEstimateComplete: false,
    netValue: grossValue,
    asOf,
  };
}

/** Mapeia código de cripto para id da CoinGecko. */
export const CRYPTO_COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
};
