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
  /** Taxa de administração descontada. */
  estimatedAdminFee: number;
  /** Valor líquido após IR e taxa adm. */
  netValue: number;
  /** Data usada na valoração (string ISO). */
  asOf: string;
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
    const netValue = inv.current_net_value != null ? Number(inv.current_net_value) : grossValue;
    const grossPnL = grossValue - invested;
    return {
      grossValue,
      invested,
      grossPnL,
      pctChange: invested > 0 ? (grossPnL / invested) * 100 : 0,
      estimatedTax: Math.max(0, grossValue - netValue),
      estimatedAdminFee: 0,
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
      estimatedAdminFee: 0,
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
    const days = daysBetween(purchase, targetDate);
    const grossValue = principal * Math.pow(1 + ratePct / 100, years);
    const grossPnL = grossValue - principal;
    const irRate = irRateForDays(days);
    const estimatedAdminFee = grossValue * (adminPct / 100) * years;
    const estimatedTax = Math.max(0, grossPnL) * irRate;
    const netValue = grossValue - estimatedAdminFee - estimatedTax;
    return {
      grossValue,
      invested: principal,
      grossPnL,
      pctChange: principal > 0 ? (grossPnL / principal) * 100 : 0,
      estimatedTax,
      estimatedAdminFee,
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
    estimatedAdminFee: 0,
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
