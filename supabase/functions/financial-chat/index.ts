import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PROD_ORIGIN = "https://cofre360.vercel.app";
const ALLOWED_ORIGINS = new Set([
  PROD_ORIGIN,
  "https://cofre360.lovable.app",
  "https://id-preview--8755cbe4-fc00-44b3-810a-824346dac2f8.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function buildCors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Expose-Headers": "content-type",
    "Vary": "Origin",
  };
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type Transaction = {
  id?: string;
  name?: string | null;
  category?: string | null;
  date?: string | null;
  purchase_date?: string | null;
  amount?: number | null;
  type?: string | null;
  card?: string | null;
  bank_account_id?: string | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_source_amount?: number | null;
  is_visible?: boolean | null;
  created_at?: string | null;
};

type EconomicExpense = {
  name: string;
  category: string;
  amount: number;
  date: Date;
  card?: string | null;
};

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_LABEL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const norm = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function formatBRL(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function brNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function parseTxDate(value: string | null | undefined, createdAt?: string | null): Date | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  const parts = text.split(/\s+/);
  if (parts.length >= 2) {
    const day = Number(parts[0]);
    const month = MONTHS_SHORT.indexOf(parts[1].slice(0, 3));
    if (Number.isFinite(day) && month >= 0) {
      const refYear = createdAt ? new Date(createdAt).getFullYear() : brNow().getFullYear();
      const year = parts[2] && /^\d{4}$/.test(parts[2]) ? Number(parts[2]) : refYear;
      return new Date(year, month, day);
    }
  }

  return null;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function rootCategory(category: string | null | undefined) {
  return String(category || "Outros").split(">")[0]?.trim() || "Outros";
}

function isTransferOrCardPayment(category: string | null | undefined) {
  const root = norm(rootCategory(category));
  return root === "transferencia" ||
    root === "transferencias" ||
    root === "pagamento de cartao" ||
    root === "pagamento do cartao" ||
    root === "pagamento cartao";
}

type MonthlyEconomicSummary = {
  income: number;
  expense: number;
  breakdown: Array<[string, number]>;
};

function isAdjustmentCategory(category: string | null | undefined) {
  return norm(rootCategory(category)) === "ajustes";
}

function isRefundCategory(category: string | null | undefined) {
  return norm(String(category || "")) === "receita > reembolso";
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function monthlyEconomicSummary(rows: Transaction[], key: string): MonthlyEconomicSummary {
  let income = 0;
  let expense = 0;
  const breakdown = new Map<string, number>();

  for (const tx of rows) {
    if (tx.is_visible === false) continue;
    const date = parseTxDate(tx.date, tx.created_at);
    if (!date || monthKey(date) !== key) continue;
    if (isTransferOrCardPayment(tx.category) || isAdjustmentCategory(tx.category)) continue;

    const amount = Number(tx.amount || 0);
    if (isRefundCategory(tx.category)) {
      expense -= amount;
      breakdown.set("Reembolsos (abatimento)", (breakdown.get("Reembolsos (abatimento)") || 0) - amount);
      continue;
    }

    if (tx.type === "income") {
      income += amount;
      continue;
    }

    if (tx.type === "expense") {
      expense += amount;
      const category = rootCategory(tx.category);
      breakdown.set(category, (breakdown.get(category) || 0) + amount);
    }
  }

  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    breakdown: [...breakdown.entries()]
      .map(([category, amount]) => [category, roundMoney(amount)] as [string, number])
      .filter(([, amount]) => amount !== 0)
      .sort((a, b) => {
        const aNegative = a[1] < 0;
        const bNegative = b[1] < 0;
        if (aNegative !== bNegative) return aNegative ? 1 : -1;
        return Math.abs(b[1]) - Math.abs(a[1]);
      }),
  };
}

function formatMonthlyBreakdown(summary: MonthlyEconomicSummary) {
  return summary.breakdown
    .map(([category, amount]) => `- ${category}: ${amount < 0 ? "-" : ""}R$ ${formatBRL(Math.abs(amount))}`)
    .join("\n");
}

function shiftMonths(date: Date, delta: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setMonth(result.getMonth() + delta);
  return result;
}

function collapseEconomicExpenses(rows: Transaction[]): EconomicExpense[] {
  const visibleExpenses = rows.filter((tx) =>
    tx.is_visible !== false &&
    tx.type === "expense" &&
    !isTransferOrCardPayment(tx.category) &&
    !isAdjustmentCategory(tx.category),
  );

  const output: EconomicExpense[] = [];
  const groups = new Map<string, Transaction[]>();

  for (const tx of visibleExpenses) {
    const total = Number(tx.total_installments || 1);
    if (tx.card && tx.installment_group_id && total > 1) {
      const group = groups.get(tx.installment_group_id) || [];
      group.push(tx);
      groups.set(tx.installment_group_id, group);
      continue;
    }

    const date = parseTxDate(tx.purchase_date || tx.date, tx.created_at);
    if (!date) continue;
    output.push({
      name: String(tx.name || "Transação"),
      category: String(tx.category || "Outros"),
      amount: Number(tx.amount || 0),
      date,
      card: tx.card,
    });
  }

  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (a, b) => Number(a.installment_number || 1) - Number(b.installment_number || 1),
    );
    const first = ordered[0];
    const sourceAmount = ordered.find((tx) => Number(tx.installment_source_amount || 0) > 0)?.installment_source_amount;
    const totalInstallments = Math.max(1, Number(first.total_installments || ordered.length || 1));
    const loadedSum = ordered.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const amount = Number(sourceAmount || 0) > 0
      ? Number(sourceAmount)
      : ordered.length >= totalInstallments
        ? loadedSum
        : Number(first.amount || 0) * totalInstallments;

    let date = ordered
      .map((tx) => parseTxDate(tx.purchase_date, tx.created_at))
      .find((d): d is Date => !!d) || null;

    if (!date) {
      const installmentDate = parseTxDate(first.date, first.created_at);
      if (installmentDate) {
        date = shiftMonths(installmentDate, -(Math.max(1, Number(first.installment_number || 1)) - 1));
      }
    }
    if (!date) continue;

    output.push({
      name: String(first.name || "Transação parcelada"),
      category: String(first.category || "Outros"),
      amount,
      date,
      card: first.card,
    });
  }

  return output;
}

function categoryTotals(rows: EconomicExpense[], key: string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (monthKey(row.date) !== key) continue;
    const category = rootCategory(row.category);
    totals.set(category, (totals.get(category) || 0) + row.amount);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function detailedCategoryTotals(rows: EconomicExpense[], key: string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (monthKey(row.date) !== key) continue;
    const category = String(row.category || "Outros").trim() || "Outros";
    totals.set(category, (totals.get(category) || 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => [category, roundMoney(amount)] as [string, number])
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => b[1] - a[1]);
}

function subcategoryTotals(rows: EconomicExpense[], key: string, root: string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (monthKey(row.date) !== key || norm(rootCategory(row.category)) !== norm(root)) continue;
    const parts = String(row.category || "Outros").split(">").map((part) => part.trim()).filter(Boolean);
    const subcategory = parts.length > 1 ? parts.slice(1).join(" > ") : "Outros";
    totals.set(subcategory, (totals.get(subcategory) || 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([subcategory, amount]) => [subcategory, roundMoney(amount)] as [string, number])
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => b[1] - a[1]);
}

function oldInstallmentDetails(rows: Transaction[], key: string) {
  const details: Array<{
    name: string;
    category: string;
    amount: number;
    installmentNumber: number;
    totalInstallments: number;
    purchaseDate: Date;
    chargeDate: Date;
    card: string;
  }> = [];
  for (const tx of rows) {
    if (tx.is_visible === false || tx.type !== "expense" || !tx.card) continue;
    if (isTransferOrCardPayment(tx.category) || isAdjustmentCategory(tx.category)) continue;
    const totalInstallments = Number(tx.total_installments || 1);
    const installmentNumber = Math.max(1, Number(tx.installment_number || 1));
    if (totalInstallments <= 1) continue;
    const chargeDate = parseTxDate(tx.date, tx.created_at);
    if (!chargeDate || monthKey(chargeDate) !== key) continue;
    let purchaseDate = parseTxDate(tx.purchase_date, tx.created_at);
    if (!purchaseDate && installmentNumber > 1) purchaseDate = shiftMonths(chargeDate, -(installmentNumber - 1));
    const chargeMonthStart = new Date(chargeDate.getFullYear(), chargeDate.getMonth(), 1);
    if (!purchaseDate || purchaseDate >= chargeMonthStart) continue;
    details.push({
      name: String(tx.name || "Transação parcelada"),
      category: rootCategory(tx.category),
      amount: roundMoney(Number(tx.amount || 0)),
      installmentNumber,
      totalInstallments,
      purchaseDate,
      chargeDate,
      card: String(tx.card || "Cartão"),
    });
  }
  return details.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function oldInstallmentCategoryTotals(rows: Transaction[], key: string) {
  const totals = new Map<string, number>();
  for (const item of oldInstallmentDetails(rows, key)) {
    totals.set(item.category, (totals.get(item.category) || 0) + item.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => [category, roundMoney(amount)] as [string, number])
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => b[1] - a[1]);
}

const STOP_WORDS = new Set([
  "quanto", "gastei", "gasto", "gastos", "com", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "esse", "essa", "este", "esta", "mes", "ano", "semana", "dia", "hoje", "ontem", "passado", "atual", "ultimo", "ultima",
  "qual", "quais", "meu", "minha", "meus", "minhas", "para", "por", "que", "tem", "ter", "foi", "sao", "entre", "ate",
  "categoria", "subcategoria", "despesa", "despesas", "receita", "receitas", "transacao", "transacoes", "comparativo", "comparar",
  ...MONTHS_FULL, ...MONTHS_SHORT,
]);

function extractKeywords(question: string) {
  return norm(question)
    .replace(/[\d/\-.]+/g, " ")
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    .filter((token, index, arr) => arr.indexOf(token) === index)
    .slice(0, 5);
}

function keywordSection(expenses: EconomicExpense[], question: string, currentKey: string, previousKey: string) {
  const keywords = extractKeywords(question);
  if (!keywords.length) return "";

  const lines: string[] = [];
  for (const keyword of keywords) {
    const matches = expenses.filter((row) =>
      norm(row.name).includes(keyword) || norm(row.category).includes(keyword),
    );
    if (!matches.length) continue;
    const current = matches
      .filter((row) => monthKey(row.date) === currentKey)
      .reduce((sum, row) => sum + row.amount, 0);
    const previous = matches
      .filter((row) => monthKey(row.date) === previousKey)
      .reduce((sum, row) => sum + row.amount, 0);
    lines.push(`- ${keyword}: mês atual R$ ${formatBRL(current)} | mês anterior R$ ${formatBRL(previous)}`);
  }
  return lines.length ? `\n### Busca específica pela pergunta\n${lines.join("\n")}` : "";
}

function requestedMonth(question: string, now: Date) {
  const text = norm(question);
  if (/mes\s+(passado|anterior)/.test(text)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { key: monthKey(d), label: `${MONTHS_LABEL[d.getMonth()]}/${d.getFullYear()}` };
  }
  for (let i = 0; i < MONTHS_FULL.length; i++) {
    if (new RegExp(`\\b(${MONTHS_FULL[i]}|${MONTHS_SHORT[i]})\\b`).test(text)) {
      return { key: `${now.getFullYear()}-${String(i + 1).padStart(2, "0")}`, label: `${MONTHS_LABEL[i]}/${now.getFullYear()}` };
    }
  }
  return null;
}

const CATEGORY_EMOJI: Record<string, string> = {
  alimentacao: "🍴",
  compras: "🛍️",
  educacao: "🎓",
  impostos: "🧾",
  "impostos/taxas": "🧾",
  lazer: "🎮",
  moradia: "🏠",
  pets: "🐾",
  saude: "💊",
  transporte: "🚗",
};

function categoryEmoji(category: string) {
  return CATEGORY_EMOJI[norm(category)] || "📦";
}

function deterministicSseResponse(content: string, corsHeaders: Record<string, string>) {
  const payload = JSON.stringify({ choices: [{ delta: { content } }] });
  return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

async function buildDeterministicFinancialAnswer(
  supabase: any,
  messages: ChatMessage[],
): Promise<string | null> {
  const userMessages = messages.filter((message) => message.role === "user");
  const currentQuestion = userMessages[userMessages.length - 1]?.content || "";
  if (!currentQuestion.trim()) return null;

  const currentNormalized = norm(currentQuestion).replace(/[!?.,:;]+$/g, "").trim();
  const detailOnly = /^\/?(detalhe|detalhar|detalha|mostre os detalhes|mostrar detalhes)$/.test(currentNormalized);
  const contextualSubcategoryOnly = /^(em quais categorias|em quais subcategorias|quais subcategorias|como esta dividido|como estão divididos|como estao divididos)$/.test(currentNormalized);
  const previousQuestion = userMessages.length > 1 ? userMessages[userMessages.length - 2]?.content || "" : "";
  const anchorQuestion = (detailOnly || contextualSubcategoryOnly) && previousQuestion
    ? `${previousQuestion} ${currentQuestion}`
    : currentQuestion;
  const q = norm(anchorQuestion);

  // Conselhos e projeções continuam com a IA; números, comparações e composições usam cálculo determinístico.
  if (!detailOnly && /(reduzir|economizar|cortar|dicas?|recomend|projec|por que|porque|como posso|analise|análise)/.test(q)) return null;

  const asksOldInstallmentCategories =
    /(parcelas?.*(compras?|gastos?).*(antig|anterior)|compras? .*antig.*parcelas?|parcelas? .*mes(es)? anterior)/.test(q) &&
    /(categor|respons|quais|origem|vieram|onde|detalh|somad|compoe|cobradas?)/.test(q);
  const asksCategoryBreakdown = /(gastos? por categoria|em quais categorias|quais categorias|categorias? .*gastei|gastei .*categorias?|mais gastos.*categorias|categorias?.*mais gastos)/.test(q);
  const asksSubcategoryBreakdown = /(subcategor|em quais categorias|como .*dividid)/.test(q);
  const asksObjectiveAmount = /(quanto .*gastei|quanto gastei|qual .*gasto|gasto total|gastos totais|total .*despesas?|despesas? .*mes|despesas? .*mês|despesas? em |despesas? de )/.test(q);
  const asksIncomeAmount = /(quanto .*receit|total .*receit|receitas? .*mes|receitas? .*mês)/.test(q);
  const asksFinancialSummary = /(como estao minhas financas|como estão minhas finanças|resumo financeiro|situacao financeira|situação financeira)/.test(q);
  const asksPurchaseComparison = /(aumentaram|diminuiram|diminuíram|compar.*(mes|mês|compras?|gastos?)|mes passado|mês passado|mes anterior|mês anterior)/.test(q) &&
    /(gastos?|compras?|alimentacao|alimentação|moradia|transporte|saude|saúde|categoria)/.test(q);
  const asksExpenseComposition = /(despesas?.*(nao entraram|não entraram|fora|diferenca|diferença|compoem|compõem).*(gastos?|categor)|o que.*nao entrou.*categor|o que.*não entrou.*categor)/.test(q);
  const asksCategoryItemDetail = /(quais .*despesas|quais .*gastos|outras despesas|outros gastos|alem|além|tirando|exceto|detalh.*categoria)/.test(q);
  const asksEconomicVsExpenseConcept =
    /(gasto economico|gasto real|despesa economica)/.test(q) &&
    /(despesas?|saida|movimentacao|fluxo de caixa|pagamento)/.test(q) &&
    /(diferenca|diferente|qual e|o que muda)/.test(q);
  if (!detailOnly && !asksOldInstallmentCategories && !asksCategoryBreakdown && !asksSubcategoryBreakdown && !asksObjectiveAmount && !asksIncomeAmount && !asksFinancialSummary && !asksPurchaseComparison && !asksExpenseComposition && !asksCategoryItemDetail && !asksEconomicVsExpenseConcept) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("id,name,category,date,purchase_date,amount,type,card,bank_account_id,installment_group_id,installment_number,total_installments,installment_source_amount,is_visible,created_at");
  if (error) throw error;

  const transactions = (data || []) as Transaction[];
  const expenses = collapseEconomicExpenses(transactions);
  const now = brNow();
  const relativeComparison = asksPurchaseComparison && /(mes passado|mês passado|mes anterior|mês anterior|aumentaram|diminuiram|diminuíram|esse mes|esse mês)/.test(q);
  const requested = relativeComparison ? null : requestedMonth(anchorQuestion, now);
  const key = requested?.key || monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const label = requested?.label || `${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()}`;
  const [keyYear, keyMonth] = key.split("-").map(Number);
  const previousDate = new Date(keyYear, keyMonth - 2, 1);
  const previousKey = monthKey(previousDate);
  const previousLabel = `${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()}`;
  const monthly = monthlyEconomicSummary(transactions, key);
  const categories = categoryTotals(expenses, key);
  const categoryTotal = roundMoney(categories.reduce((sum, [, value]) => sum + value, 0));
  const previousCategories = categoryTotals(expenses, previousKey);
  const previousCategoryTotal = roundMoney(previousCategories.reduce((sum, [, value]) => sum + value, 0));
  const oldInstallmentCategories = oldInstallmentCategoryTotals(transactions, key);
  const oldInstallmentRows = oldInstallmentDetails(transactions, key);
  const oldInstallmentTotal = roundMoney(oldInstallmentCategories.reduce((sum, [, value]) => sum + value, 0));
  const detailedCategories = detailedCategoryTotals(expenses, key);

  if (asksOldInstallmentCategories) {
    const categorySummary = oldInstallmentCategories.length
      ? oldInstallmentCategories.map(([category, amount]) => `- ${categoryEmoji(category)} **${category} — R$ ${formatBRL(amount)}**`).join("\n")
      : "(nenhuma parcela de compra antiga cobrada no período)";
    const wantsDetail = detailOnly || /(detalh|quais parcelas|lancamentos?|lançamentos?|compras antigas que)/.test(q);
    if (!wantsDetail) {
      return `### 💳 Parcelas de compras antigas — ${label}\n\n**Total cobrado no mês vindo de compras anteriores: R$ ${formatBRL(oldInstallmentTotal)}**\n\n${categorySummary}\n\n> 💡 Aqui entram somente parcelas cobradas em ${label} cuja **compra original ocorreu em mês anterior**. O valor é calculado a partir das parcelas reais, não pela diferença entre DESPESAS e Gastos por categoria.`;
    }
    const detailLines = oldInstallmentRows.length
      ? oldInstallmentRows.slice(0, 25).map((item) => {
          const purchase = item.purchaseDate.toLocaleDateString("pt-BR");
          return `- **${item.name} — R$ ${formatBRL(item.amount)}** · ${item.installmentNumber}/${item.totalInstallments} · ${item.category} · ${item.card} · compra ${purchase}`;
        }).join("\n")
      : "(nenhuma parcela de compra antiga cobrada no período)";
    return `### 💳 Detalhe das parcelas de compras antigas — ${label}\n\n**Total dessas parcelas: R$ ${formatBRL(oldInstallmentTotal)}**\n\n${detailLines}\n\n**Resumo por categoria**\n${categorySummary}\n\n> 💡 Estes lançamentos são selecionados individualmente pela data da cobrança e pela data original da compra. **Não** são estimados pela diferença entre os dois totais mensais.`;
  }

  if (asksFinancialSummary && !detailOnly) {
    const result = roundMoney(monthly.income - monthly.expense);
    return `### 💰 Resumo financeiro — ${label}\n\n- **Receitas: R$ ${formatBRL(monthly.income)}**\n- **Despesas: R$ ${formatBRL(monthly.expense)}**\n- **Resultado: ${result < 0 ? "-" : ""}R$ ${formatBRL(Math.abs(result))}**\n- Compras realizadas no período, pela data original da compra: **R$ ${formatBRL(categoryTotal)}**\n\n> 💡 DESPESAS segue a cobrança/lançamento do mês. “Compras realizadas” é uma visão econômica por data da compra e não deve ser somada às DESPESAS.`;
  }

  if (asksIncomeAmount && !detailOnly) {
    return `### 💰 Receitas — ${label}\n\n**Total: R$ ${formatBRL(monthly.income)}**\n\nEsse total exclui transferências internas e ajustes de saldo. Reembolsos confirmados de cartão reduzem DESPESAS e não são contados novamente como receita.`;
  }

  if (asksEconomicVsExpenseConcept && !detailOnly) {
    return `### 💳 Gasto econômico x movimentação financeira — ${label}\n\n**No Cofre360, o card DESPESAS é a referência do gasto econômico líquido do mês: R$ ${formatBRL(monthly.expense)}.**\n\nEle mostra o que efetivamente pesa como despesa no período, sem contar novamente movimentos que apenas deslocam dinheiro:\n\n- **Transferências entre suas contas** não entram como despesa.\n- **Pagamentos de fatura do cartão** não entram de novo, porque as compras/parcelas já compõem as despesas.\n- **Ajustes de saldo** ficam fora por não representarem consumo.\n- **Reembolsos confirmados** reduzem o total de despesas.\n\nJá a **movimentação financeira das contas** mede entradas e saídas de caixa e pode incluir transferências e pagamentos de cartão. Por isso, saída de dinheiro da conta não é a mesma coisa que gasto econômico.\n\n> 💡 **Resumo:** para saber quanto pesou economicamente no mês, use **DESPESAS: R$ ${formatBRL(monthly.expense)}**. Para entender por onde o dinheiro transitou, olhe a movimentação das contas. A visão de gastos por categoria é uma análise separada, baseada na data original e no valor econômico da compra.`;
  }

  const allCategoryNames = Array.from(new Set(expenses.map((row) => rootCategory(row.category))));
  const matchedCategory = allCategoryNames
    .sort((a, b) => b.length - a.length)
    .find((category) => {
      const needle = norm(category);
      return needle.length >= 3 && q.includes(needle);
    });

  const allFullCategoryNames = Array.from(new Set(expenses.map((row) => String(row.category || "Outros").trim())));
  const matchedFullCategory = allFullCategoryNames
    .sort((a, b) => b.length - a.length)
    .find((category) => {
      const parts = category.split(">").map((part) => part.trim()).filter(Boolean);
      const leaf = norm(parts[parts.length - 1]);
      return leaf.length >= 4 && leaf !== "outros" && q.includes(leaf);
    });
  const allCardNames = Array.from(new Set(expenses.map((row) => row.card).filter((card): card is string => !!card)));
  const matchedCard = allCardNames.sort((a, b) => b.length - a.length).find((card) => q.includes(norm(card)));

  if (asksPurchaseComparison && !detailOnly) {
    let currentValue = categoryTotal;
    let previousValue = previousCategoryTotal;
    let subject = "Compras realizadas";
    if (matchedFullCategory) {
      currentValue = roundMoney(detailedCategories.find(([category]) => norm(category) === norm(matchedFullCategory))?.[1] || 0);
      const previousDetailed = detailedCategoryTotals(expenses, previousKey);
      previousValue = roundMoney(previousDetailed.find(([category]) => norm(category) === norm(matchedFullCategory))?.[1] || 0);
      subject = matchedFullCategory;
    } else if (matchedCategory) {
      currentValue = roundMoney(categories.find(([category]) => norm(category) === norm(matchedCategory))?.[1] || 0);
      previousValue = roundMoney(previousCategories.find(([category]) => norm(category) === norm(matchedCategory))?.[1] || 0);
      subject = matchedCategory;
    }
    const difference = roundMoney(currentValue - previousValue);
    const direction = difference > 0 ? "aumentaram" : difference < 0 ? "diminuíram" : "ficaram iguais";
    const pct = previousValue !== 0 ? Math.abs((difference / previousValue) * 100) : null;
    const pctText = pct === null ? "sem percentual comparável, porque o mês anterior foi zero" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    return `### 📈 Comparativo — ${subject}\n\n- **${label}: R$ ${formatBRL(currentValue)}**\n- **${previousLabel}: R$ ${formatBRL(previousValue)}**\n- Diferença: **${difference < 0 ? "-" : "+"}R$ ${formatBRL(Math.abs(difference))}** (${pctText})\n\nOs valores **${direction}** na comparação. Esta análise usa a **data original da compra e o valor econômico da compra**, não o mês da fatura.`;
  }

  if (asksExpenseComposition && !detailOnly) {
    const monthlyLines = monthly.breakdown.length
      ? monthly.breakdown.map(([category, amount]) => `- **${category}: ${amount < 0 ? "-" : ""}R$ ${formatBRL(Math.abs(amount))}**`).join("\n")
      : "(sem despesas no período)";
    const oldLines = oldInstallmentCategories.length
      ? oldInstallmentCategories.map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`).join("\n")
      : "(nenhuma parcela antiga identificada)";
    return `### 🧩 Composição das despesas — ${label}\n\n**DESPESAS do mês: R$ ${formatBRL(monthly.expense)}**\n**Compras realizadas no mês: R$ ${formatBRL(categoryTotal)}**\n\n#### Cobranças/lançamentos que formam DESPESAS\n${monthlyLines}\n\n#### Parcelas de compras antigas identificadas no mês — R$ ${formatBRL(oldInstallmentTotal)}\n${oldLines}\n\n> ⚠️ **Importante:** não calculo “parcelas antigas” fazendo DESPESAS − Compras realizadas. As duas visões usam datas e bases diferentes; as parcelas antigas acima foram identificadas transação por transação.`;
  }

  if (matchedFullCategory && asksObjectiveAmount && !detailOnly) {
    const value = roundMoney(detailedCategories.find(([category]) => norm(category) === norm(matchedFullCategory))?.[1] || 0);
    return `### 🧾 ${matchedFullCategory} — ${label}\n\n**Total comprado no período: R$ ${formatBRL(value)}**\n\n> 💡 O cálculo usa a data original da compra e o valor econômico total. Parcelas cobradas agora de compras antigas não entram novamente.`;
  }

  if (matchedCard && asksObjectiveAmount && !detailOnly) {
    const value = roundMoney(expenses.filter((row) => monthKey(row.date) === key && norm(row.card) === norm(matchedCard)).reduce((sum, row) => sum + row.amount, 0));
    return `### 💳 ${matchedCard} — ${label}\n\n**Compras realizadas no cartão: R$ ${formatBRL(value)}**\n\n> 💡 Este valor considera a data original e o valor econômico das compras vinculadas ao cartão, sem repetir as parcelas futuras.`;
  }

  if (matchedCategory && asksCategoryItemDetail && !detailOnly) {
    let items = expenses
      .filter((row) => monthKey(row.date) === key && norm(rootCategory(row.category)) === norm(matchedCategory))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

    const exclusionMatch = q.match(/(?:alem(?: do| da| de)?|tirando|exceto)\s+(.+)$/);
    const exclusionWords = (exclusionMatch?.[1] || "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !["categoria", "mes", "este", "esse"].includes(word));
    if (exclusionWords.length) {
      items = items.filter((row) => {
        const haystack = `${norm(row.name)} ${norm(row.category)}`;
        return !exclusionWords.some((word) => haystack.includes(word));
      });
    }

    const total = roundMoney(items.reduce((sum, row) => sum + row.amount, 0));
    const lines = items.length
      ? items.slice(0, 30).map((row) => `- **${row.name} — R$ ${formatBRL(row.amount)}** · ${row.category}`).join("\n")
      : "(nenhuma compra encontrada com esses critérios)";
    const exclusionText = exclusionWords.length ? `, excluindo “${exclusionWords.join(" ")}”` : "";
    return `### ${categoryEmoji(matchedCategory)} Detalhe de ${matchedCategory} — ${label}\n\n**Total${exclusionText}: R$ ${formatBRL(total)}**\n\n${lines}\n\n> 💡 O detalhamento usa as compras econômicas reais do período, item por item, em vez de inferir o restante por diferença.`;
  }

  if (matchedCategory && asksSubcategoryBreakdown && !detailOnly) {
    const subcategories = subcategoryTotals(expenses, key, matchedCategory);
    const value = roundMoney(subcategories.reduce((sum, [, amount]) => sum + amount, 0));
    const lines = subcategories.length ? subcategories.map(([subcategory, amount]) => `- **${subcategory} — R$ ${formatBRL(amount)}**`).join("\n") : "(sem compras no período)";
    return `### ${categoryEmoji(matchedCategory)} ${matchedCategory} por subcategoria — ${label}\n\n**Total: R$ ${formatBRL(value)}**\n\n${lines}\n\n> 💡 A soma das subcategorias fecha com o total econômico de ${matchedCategory} no período.`;
  }

  if (matchedCategory && asksObjectiveAmount && !detailOnly) {
    const value = roundMoney(categories.find(([category]) => norm(category) === norm(matchedCategory))?.[1] || 0);
    return `### ${categoryEmoji(matchedCategory)} ${matchedCategory} — ${label}\n\n**Total comprado no período: R$ ${formatBRL(value)}**\n\n> 💡 Este valor usa a **data original da compra**. Parcelas de compras feitas em meses anteriores podem estar nas DESPESAS de ${label}, mas não entram novamente como novo gasto em ${matchedCategory}.`;
  }

  const categoryLines = categories.length
    ? categories.slice(0, 12).map(([category, amount]) => `- ${categoryEmoji(category)} **${category} — R$ ${formatBRL(amount)}**`).join("\n")
    : "(sem compras no período)";

  if (asksCategoryBreakdown && !detailOnly) {
    return `### 📊 Gastos por categoria — ${label}\n\n**Compras realizadas no período: R$ ${formatBRL(categoryTotal)}**\n\n${categoryLines}\n\n> 💡 Esta visão usa a **data da compra e o valor total econômico da compra**. Parcelas cobradas agora de compras antigas não são somadas novamente nas categorias.`;
  }

  if (detailOnly) {
    const monthlyLines = monthly.breakdown.length
      ? monthly.breakdown.map(([category, amount]) => `- **${category}: ${amount < 0 ? "-" : ""}R$ ${formatBRL(Math.abs(amount))}**`).join("\n")
      : "(sem despesas no período)";
    return `### 📊 Detalhamento — ${label}\n\n**💳 DESPESAS do mês: R$ ${formatBRL(monthly.expense)}**\n\n${monthlyLines}\n\n**🧾 Compras realizadas no mês por categoria: R$ ${formatBRL(categoryTotal)}**\n\n${categoryLines}\n\n> 💡 Os dois totais usam bases diferentes e **não precisam ser iguais**. Para identificar parcelas antigas, use o detalhamento específico de parcelas; não faça uma subtração entre os dois totais.`;
  }

  if (asksObjectiveAmount) {
    return `### 💳 Despesas — ${label}\n\n**Total: R$ ${formatBRL(monthly.expense)}**\n\nEsse valor segue a mesma regra do card **DESPESAS** da Home/Transações: considera os lançamentos e parcelas do período, exclui transferências, pagamentos de cartão e ajustes de saldo, e abate reembolsos confirmados.`;
  }

  return null;
}

async function buildFinancialContext(supabase: any, question: string) {
  const [txRes, accRes, cardsRes, goalsRes, budgetsRes] = await Promise.all([
    supabase.from("transactions").select("id,name,category,date,purchase_date,amount,type,card,bank_account_id,installment_group_id,installment_number,total_installments,installment_source_amount,is_visible,created_at"),
    supabase.from("bank_accounts").select("id,name,balance,is_visible"),
    supabase.from("cards").select("name,used,card_limit,is_visible"),
    supabase.from("goals").select("name,current_amount,target_amount"),
    supabase.from("budget_categories").select("category,budget_limit"),
  ]);

  if (txRes.error) throw txRes.error;
  if (accRes.error) throw accRes.error;
  if (cardsRes.error) throw cardsRes.error;

  const transactions = (txRes.data || []) as Transaction[];
  const accounts = accRes.data || [];
  const cards = cardsRes.data || [];
  const goals = goalsRes.data || [];
  const budgets = budgetsRes.data || [];
  const expenses = collapseEconomicExpenses(transactions);

  const now = brNow();
  const currentKey = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousKey = monthKey(previousDate);
  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
  const currentDetailedCategories = detailedCategoryTotals(expenses, currentKey);
  const previousDetailedCategories = detailedCategoryTotals(expenses, previousKey);
  const currentCategoryExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousCategoryExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);

  // Mesma regra dos cards RECEITAS/DESPESAS da Home e de Transações.
  const currentMonthly = monthlyEconomicSummary(transactions, currentKey);
  const previousMonthly = monthlyEconomicSummary(transactions, previousKey);
  const currentIncome = currentMonthly.income;
  const previousIncome = previousMonthly.income;
  const currentExpense = currentMonthly.expense;
  const previousExpense = previousMonthly.expense;
  const currentMonthlyBreakdown = formatMonthlyBreakdown(currentMonthly);
  const previousMonthlyBreakdown = formatMonthlyBreakdown(previousMonthly);

  const accountMovement = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.is_visible === false || !tx.bank_account_id || tx.card) continue;
    const signed = tx.type === "income" ? Number(tx.amount || 0) : -Number(tx.amount || 0);
    accountMovement.set(tx.bank_account_id, (accountMovement.get(tx.bank_account_id) || 0) + signed);
  }
  const accountLines = accounts
    .filter((account: any) => account.is_visible !== false)
    .map((account: any) => {
      const balance = Number(account.balance || 0) + (accountMovement.get(account.id) || 0);
      return `- ${account.name}: R$ ${formatBRL(balance)}`;
    })
    .join("\n");

  const cardLines = cards
    .filter((card: any) => card.is_visible !== false)
    .map((card: any) => `- ${card.name}: usado R$ ${formatBRL(Number(card.used || 0))} de R$ ${formatBRL(Number(card.card_limit || 0))}`)
    .join("\n");

  const budgetLines = budgets.map((budget: any) => {
    const spent = currentCategories
      .filter(([category]) => norm(category) === norm(budget.category))
      .reduce((sum, [, value]) => sum + value, 0);
    const limit = Number(budget.budget_limit || 0);
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return `- ${budget.category}: R$ ${formatBRL(spent)} de R$ ${formatBRL(limit)} (${pct}%)`;
  }).join("\n");

  const goalLines = goals.map((goal: any) =>
    `- ${goal.name}: R$ ${formatBRL(Number(goal.current_amount || 0))} / R$ ${formatBRL(Number(goal.target_amount || 0))}`,
  ).join("\n");

  const currentCategoryLines = currentCategories.slice(0, 15)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");
  const previousCategoryLines = previousCategories.slice(0, 15)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");
  const currentDetailedCategoryLines = currentDetailedCategories.slice(0, 30)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");
  const previousDetailedCategoryLines = previousDetailedCategories.slice(0, 30)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\n");
  const currentEconomicItemLines = expenses
    .filter((row) => monthKey(row.date) === currentKey)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 100)
    .map((row) => `- ${row.date.toLocaleDateString("pt-BR")} | ${row.name} | ${row.category} | R$ ${formatBRL(row.amount)}${row.card ? ` | ${row.card}` : ""}`)
    .join("\n");
  const previousEconomicItemLines = expenses
    .filter((row) => monthKey(row.date) === previousKey)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, 100)
    .map((row) => `- ${row.date.toLocaleDateString("pt-BR")} | ${row.name} | ${row.category} | R$ ${formatBRL(row.amount)}${row.card ? ` | ${row.card}` : ""}`)
    .join("\n");

  const requested = requestedMonth(question, now);
  let requestedSection = "";
  if (requested && requested.key !== currentKey && requested.key !== previousKey) {
    const requestedMonthly = monthlyEconomicSummary(transactions, requested.key);
    const requestedCategories = categoryTotals(expenses, requested.key);
    const requestedCategoryTotal = requestedCategories.reduce((sum, [, value]) => sum + value, 0);
    requestedSection = `\n### Período solicitado — ${requested.label} — MESMA REGRA DA HOME/TRANSAÇÕES
- Receitas: R$ ${formatBRL(requestedMonthly.income)}
- Despesas: R$ ${formatBRL(requestedMonthly.expense)}
- Resultado: R$ ${formatBRL(requestedMonthly.income - requestedMonthly.expense)}

#### Composição das DESPESAS do período pelo mês de cobrança/lançamento — pode incluir parcelas de compras antigas
${formatMonthlyBreakdown(requestedMonthly) || "(sem despesas)"}

#### Gastos por categoria — compras realizadas no período (data da compra; parcelas futuras não repetem gasto)
- Total por categorias no mês da compra: R$ ${formatBRL(requestedCategoryTotal)}
${requestedCategories.slice(0, 15).map(([c, v]) => `- ${c}: R$ ${formatBRL(v)}`).join("\n") || "(sem despesas)"}`;
  }

  const recentTransactions = [...transactions]
    .filter((tx) => tx.is_visible !== false)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 80)
    .map((tx) => `- ${tx.date || "sem data"} | ${tx.type === "income" ? "+" : "-"}R$ ${formatBRL(Number(tx.amount || 0))} | ${tx.name || "Transação"} | ${tx.category || "Outros"}`)
    .join("\n");

  return `## Dados financeiros reais do usuário
Data de referência: ${now.toLocaleDateString("pt-BR")}

### Mês atual — ${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()} — MESMA REGRA DA HOME/TRANSAÇÕES
- Receitas: R$ ${formatBRL(currentIncome)}
- Despesas: R$ ${formatBRL(currentExpense)}
- Resultado: R$ ${formatBRL(currentIncome - currentExpense)}

#### Composição das DESPESAS do mês atual pelo mês de cobrança/lançamento — pode incluir parcelas de compras antigas
${currentMonthlyBreakdown || "(sem despesas)"}

#### Gastos por categoria — compras realizadas no período (data da compra; parcelas futuras não repetem gasto)
- Total por categorias no mês da compra: R$ ${formatBRL(currentCategoryExpense)}
${currentCategoryLines || "(sem despesas)"}

#### Detalhe real por categoria/subcategoria — compras do mês atual
${currentDetailedCategoryLines || "(sem despesas)"}

#### Compras econômicas reais do mês atual — item a item
${currentEconomicItemLines || "(sem compras)"}

### Mês anterior — ${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()} — MESMA REGRA DA HOME/TRANSAÇÕES
- Receitas: R$ ${formatBRL(previousIncome)}
- Despesas: R$ ${formatBRL(previousExpense)}
- Resultado: R$ ${formatBRL(previousIncome - previousExpense)}

#### Composição das DESPESAS do mês anterior pelo mês de cobrança/lançamento — pode incluir parcelas de compras antigas
${previousMonthlyBreakdown || "(sem despesas)"}

#### Gastos por categoria — compras realizadas no período (data da compra; parcelas futuras não repetem gasto)
- Total por categorias no mês da compra: R$ ${formatBRL(previousCategoryExpense)}
${previousCategoryLines || "(sem despesas)"}

#### Detalhe real por categoria/subcategoria — compras do mês anterior
${previousDetailedCategoryLines || "(sem despesas)"}

#### Compras econômicas reais do mês anterior — item a item
${previousEconomicItemLines || "(sem compras)"}

### Contas — saldo calculado
${accountLines || "(nenhuma conta)"}

### Cartões
${cardLines || "(nenhum cartão)"}

### Orçamentos do mês atual
${budgetLines || "(nenhum orçamento)"}

### Metas
${goalLines || "(nenhuma meta)"}${requestedSection}${keywordSection(expenses, question, currentKey, previousKey)}

### Transações recentes (referência; parcelas permanecem mensais aqui)
${recentTransactions || "(nenhuma transação)"}`;
}

const SYSTEM_PROMPT = `Você é o Assistente Financeiro do Cofre360. Responda em português brasileiro, de forma objetiva, útil e visualmente fácil de ler no celular.

Regras financeiras obrigatórias:
- Use SOMENTE os dados financeiros fornecidos no contexto; nunca invente valores.
- Quando o usuário perguntar "gasto total", "quanto gastei no mês", "despesas do mês" ou equivalente, use SEMPRE o valor "Despesas" da seção "MESMA REGRA DA HOME/TRANSAÇÕES". Esse é o mesmo número exibido nos cards do app.
- Se o usuário perguntar "em quais categorias", "gastos por categoria", "quanto gastei com Transporte/Alimentação/etc." ou equivalente, use SEMPRE a seção "Gastos por categoria — compras realizadas no período". Essa visão usa a data original da compra e não repete parcelas nos meses seguintes.
- NUNCA use a "Composição das DESPESAS pelo mês de cobrança/lançamento" como se fosse gasto novo por categoria. Ela serve apenas para explicar quais parcelas/lançamentos compõem o card mensal de DESPESAS e pode incluir compras de meses anteriores.
- NUNCA estime parcelas de compras antigas subtraindo DESPESAS de Gastos por categoria. Identifique parcelas antigas somente pelos lançamentos reais cuja cobrança está no período e cuja data original da compra é anterior ao período.
- A seção "Transações recentes" é apenas uma amostra de referência e pode ser incompleta. NUNCA faça uma soma exaustiva, reconciliação ou conclusão de ausência de lançamentos usando somente essa amostra; prefira os totais pré-calculados e o detalhe real por categoria/subcategoria.
- Não invente a natureza de uma diferença entre totais e não use expressões como "provavelmente parcelas de...", "sugere..." ou "pode incluir..." sem transações explícitas que comprovem isso.
- Não classifique uma despesa como fixa, essencial, recorrente ou dispensável sem essa informação explícita nos dados ou sem o usuário ter confirmado.
- Se o usuário pedir uma subcategoria ou uma composição de categoria, use o "Detalhe real por categoria/subcategoria" e garanta que a soma feche com o total da categoria.
- Para perguntas como “quais outras despesas”, “além de”, “tirando” ou “exceto”, use as compras econômicas reais item a item e aplique a exclusão explicitamente. Não responda apenas com uma subtração de totais se os itens estiverem disponíveis.
- Se o usuário perguntar especificamente quais categorias originaram parcelas de compras antigas cobradas no mês, responda SOMENTE com as parcelas do mês cuja compra original ocorreu em mês anterior, agrupadas pela categoria da compra. Não use a visão geral de "Gastos por categoria" para essa pergunta.
- Se o usuário perguntar quais parcelas/lançamentos compõem o total de DESPESAS, use a composição mensal e deixe explícito que parcelas de compras antigas continuam sendo despesas do mês da cobrança, mas não novos gastos da categoria.
- Se o usuário responder apenas "detalhe" depois de perguntar o gasto/despesa total do mês, apresente as duas visões separadamente e com rótulos claros: (1) DESPESAS do mês pela cobrança/lançamento; (2) GASTOS POR CATEGORIA das compras realizadas no mês. Não force os dois totais a serem iguais.
- NÃO use o "Total por categorias no mês da compra" como resposta para "gasto total/despesas do mês". Essa visão existe para análise econômica por categoria e pode diferir do card mensal por compras parceladas e data original da compra.
- Os totais de DESPESAS do mês e GASTOS POR CATEGORIA têm propósitos diferentes e NÃO precisam fechar entre si. DESPESAS segue a data de cobrança/lançamento; categorias seguem a data original da compra.
- Ajustes de saldo não são receita/despesa econômica; transferências internas e pagamentos de cartão também não. Reembolsos confirmados reduzem despesas e não contam como receita.
- Para perguntas de gasto por categoria, use os valores pré-calculados em "Gastos por categoria" ou "Busca específica pela pergunta".
- Gastos parcelados de cartão são consolidados economicamente no mês da compra nas seções de categoria; o valor integral da compra entra uma única vez no mês da compra. As parcelas futuras entram em DESPESAS do respectivo mês/fatura, mas NÃO entram novamente como gasto de Transporte, Alimentação, Compras ou qualquer outra categoria.
- Transferências entre contas e pagamentos de cartão não são novos gastos por categoria e foram excluídos desses totais.
- Diferencie gasto econômico de movimentação de caixa/fatura quando isso for relevante.
- Para projeção de saldo/fim do mês, só forneça um valor projetado se o contexto contiver entradas e saídas futuras suficientes para calculá-lo. Caso contrário, diga que não há base confiável para uma projeção e mostre apenas os valores atuais disponíveis.
- Em perguntas conceituais, responda primeiro a conclusão em linguagem simples e só depois explique a regra. Não responda apenas repetindo o valor do card.
- Se o usuário perguntar a diferença entre gasto econômico/real e o total de DESPESAS do mês, explique que, no resumo mensal do Cofre360, o card DESPESAS é a referência do gasto econômico líquido do período: ele exclui transferências internas, pagamentos de cartão e ajustes de saldo, e abate reembolsos confirmados. Diferencie isso de saída/movimentação de caixa. Se útil, esclareça também que a visão por categoria usa a data original e o valor econômico integral da compra e, por isso, é uma análise separada.
- Sempre que houver um valor real no contexto que responda à pergunta, incorpore-o à explicação em vez de dar uma resposta puramente genérica.
- Formate dinheiro em R$ e datas em dd/mm/aaaa quando citar datas.
- Se não houver dado suficiente, diga isso claramente.

Padrão visual obrigatório das respostas:
- Use Markdown com títulos curtos, listas e espaços entre blocos; evite parágrafos longos.
- Quando a pergunta envolver uma categoria ou período, abra com um título visual, por exemplo: "### 🍴 Alimentação — Setembro/2026".
- Destaque o total principal em negrito logo no início, por exemplo: "**Total: R$ 1.045,34**".
- Use emojis com moderação como guias visuais, normalmente um por título ou linha de categoria. Exemplos: 🛒 Supermercado, ☕ Padaria/Café, 🍕 Restaurante, 📦 Outros, 🚗 Transporte, 🏠 Moradia, 💊 Saúde, 🎓 Educação, 🛍️ Compras, 🎮 Lazer, 🐾 Pets, 💳 Cartões, 💰 Receitas.
- Em detalhamentos, use lista Markdown com exatamente uma categoria/subcategoria por item e por linha, por exemplo: "- 🛒 **Supermercado — R$ 758,03**". Nunca coloque duas categorias na mesma linha.
- Use "> ⚠️ **Atenção:** ..." para possíveis inconsistências, categorias suspeitas ou dados que não fecham.
- Use "> 💡 **Insight:** ..." para uma recomendação prática ou oportunidade de economia quando houver base nos dados.
- Não repita a mesma soma ou lista duas vezes. Não escreva contas aritméticas extensas salvo se o usuário pedir explicitamente.
- Quando houver muitas transações, mostre os principais itens e resuma o restante em vez de criar um bloco enorme.
- Preserve clareza acima da quantidade de emojis: não coloque emoji em toda frase.
- Mantenha a resposta concisa, normalmente com 1 título, 1 total destacado, até 6 itens relevantes e no máximo 2 blocos de observação/insight.`;

const AUDITED_SUGGESTIONS = [
  "Como estão minhas finanças este mês?",
  "Qual foi o gasto total deste mês?",
  "Quais categorias tiveram mais gastos neste mês?",
  "Como os gastos de Alimentação estão divididos por subcategoria neste mês?",
  "Quais parcelas de compras antigas foram cobradas neste mês?",
  "Qual foi o total de receitas deste mês?",
  "Compare as compras realizadas neste mês com o mês passado.",
  "Qual a diferença entre gasto econômico e movimentação financeira?",
];

async function generateSuggestions(_apiKey: string, messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const last = norm(lastUser);
  let preferred = AUDITED_SUGGESTIONS;
  if (/parcelas?.*(antig|anterior)/.test(last)) preferred = [AUDITED_SUGGESTIONS[7], AUDITED_SUGGESTIONS[2], AUDITED_SUGGESTIONS[6], ...AUDITED_SUGGESTIONS];
  else if (/categoria|alimentacao|alimentação/.test(last)) preferred = [AUDITED_SUGGESTIONS[3], AUDITED_SUGGESTIONS[4], AUDITED_SUGGESTIONS[6], ...AUDITED_SUGGESTIONS];
  else if (/receita|despesa|gasto total|financas|finanças/.test(last)) preferred = [AUDITED_SUGGESTIONS[2], AUDITED_SUGGESTIONS[4], AUDITED_SUGGESTIONS[7], ...AUDITED_SUGGESTIONS];
  return preferred.filter((item, index, arr) => arr.indexOf(item) === index && norm(item) !== last).slice(0, 3);
}

serve(async (req) => {
  const corsHeaders = buildCors(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("financial-chat missing server configuration");
      return new Response(JSON.stringify({ error: "Assistente indisponível por configuração do servidor" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error("financial-chat invalid user session", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages as ChatMessage[] : [];
    if (!messages.length) {
      return new Response(JSON.stringify({ error: "Nenhuma mensagem enviada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    if (url.searchParams.get("mode") === "suggestions") {
      const suggestions = await generateSuggestions(LOVABLE_API_KEY, messages);
      return new Response(JSON.stringify({ suggestions }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const question = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const deterministicAnswer = await buildDeterministicFinancialAnswer(supabase, messages);
    if (deterministicAnswer) {
      return deterministicSseResponse(deterministicAnswer, corsHeaders);
    }
    const context = await buildFinancialContext(supabase, question);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${context}` },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const gatewayBody = await response.text();
      console.error("financial-chat AI gateway error", response.status, gatewayBody);
      const status = response.status === 429 || response.status === 402 ? response.status : 502;
      const error = response.status === 429
        ? "Muitas requisições. Aguarde alguns segundos."
        : response.status === 402
          ? "Créditos do assistente esgotados."
          : "Erro no provedor de IA";
      return new Response(JSON.stringify({ error }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("financial-chat error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Erro desconhecido",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
