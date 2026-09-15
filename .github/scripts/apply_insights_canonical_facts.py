from pathlib import Path

p = Path('supabase/functions/financial-chat/index.ts')
text = p.read_text()

anchor = '''function deterministicSseResponse(content: string, corsHeaders: Record<string, string>) {
  const payload = JSON.stringify({ choices: [{ delta: { content } }] });
  return new Response(`data: ${payload}\\n\\ndata: [DONE]\\n\\n`, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
'''
helper = anchor + '''

type CanonicalMonthFacts = {
  month?: string;
  income?: number | string;
  expense?: number | string;
  result?: number | string;
  cardExpenseComponent?: number | string;
  expenseBreakdown?: Array<{ category?: string; amount?: number | string }>;
  categories?: Array<{ category?: string; amount?: number | string }>;
  cards?: Array<{ card?: string; amount?: number | string }>;
  oldInstallments?: { count?: number | string; amount?: number | string };
  oldInstallmentCategories?: Array<{ category?: string; amount?: number | string }>;
};

async function loadCanonicalMonthFacts(supabase: any, key: string): Promise<CanonicalMonthFacts | null> {
  const { data, error } = await supabase.rpc("financial_month_facts", { p_month: `${key}-01` });
  if (error) {
    console.warn("financial-chat canonical facts fallback", key, error.message);
    return null;
  }
  return (data || null) as CanonicalMonthFacts | null;
}

function canonicalCategoryPairs(
  rows: CanonicalMonthFacts["categories"] | CanonicalMonthFacts["expenseBreakdown"] | CanonicalMonthFacts["oldInstallmentCategories"],
): Array<[string, number]> {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => [String(item?.category || "Sem categoria"), roundMoney(Number(item?.amount || 0))] as [string, number])
    .filter(([, amount]) => amount !== 0);
}

function monthlyFromCanonical(facts: CanonicalMonthFacts | null, fallback: MonthlyEconomicSummary): MonthlyEconomicSummary {
  if (!facts) return fallback;
  return {
    income: roundMoney(Number(facts.income || 0)),
    expense: roundMoney(Number(facts.expense || 0)),
    breakdown: canonicalCategoryPairs(facts.expenseBreakdown),
  };
}
'''
if anchor not in text:
    raise SystemExit('deterministicSseResponse anchor not found')
text = text.replace(anchor, helper, 1)

old = '''  const monthly = monthlyEconomicSummary(transactions, key);
  const categories = categoryTotals(expenses, key);
  const categoryTotal = roundMoney(categories.reduce((sum, [, value]) => sum + value, 0));
  const previousCategories = categoryTotals(expenses, previousKey);
  const previousCategoryTotal = roundMoney(previousCategories.reduce((sum, [, value]) => sum + value, 0));
  const oldInstallmentCategories = oldInstallmentCategoryTotals(transactions, key);
  const oldInstallmentRows = oldInstallmentDetails(transactions, key);
  const oldInstallmentTotal = roundMoney(oldInstallmentCategories.reduce((sum, [, value]) => sum + value, 0));
  const detailedCategories = detailedCategoryTotals(expenses, key);
'''
new = '''  const [canonicalCurrent, canonicalPrevious] = await Promise.all([
    loadCanonicalMonthFacts(supabase, key),
    loadCanonicalMonthFacts(supabase, previousKey),
  ]);
  const monthly = monthlyFromCanonical(canonicalCurrent, monthlyEconomicSummary(transactions, key));
  const categories = canonicalCurrent
    ? canonicalCategoryPairs(canonicalCurrent.categories)
    : categoryTotals(expenses, key);
  const categoryTotal = roundMoney(categories.reduce((sum, [, value]) => sum + value, 0));
  const previousCategories = canonicalPrevious
    ? canonicalCategoryPairs(canonicalPrevious.categories)
    : categoryTotals(expenses, previousKey);
  const previousCategoryTotal = roundMoney(previousCategories.reduce((sum, [, value]) => sum + value, 0));
  const oldInstallmentRows = oldInstallmentDetails(transactions, key);
  // Detailed installment rows are kept transaction-level for the mobile detail view;
  // the summary/category totals prefer the canonical monthly RPC.
  const oldInstallmentCategories = canonicalCurrent
    ? canonicalCategoryPairs(canonicalCurrent.oldInstallmentCategories)
    : oldInstallmentCategoryTotals(transactions, key);
  const oldInstallmentTotal = canonicalCurrent
    ? roundMoney(Number(canonicalCurrent.oldInstallments?.amount || 0))
    : roundMoney(oldInstallmentCategories.reduce((sum, [, value]) => sum + value, 0));
  const detailedCategories = detailedCategoryTotals(expenses, key);
'''
if old not in text:
    raise SystemExit('deterministic calculations anchor not found')
text = text.replace(old, new, 1)

old_ctx = '''  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
  const currentDetailedCategories = detailedCategoryTotals(expenses, currentKey);
  const previousDetailedCategories = detailedCategoryTotals(expenses, previousKey);
  const currentCategoryExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousCategoryExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);

  // Mesma regra dos cards RECEITAS/DESPESAS da Home e de Transações.
  const currentMonthly = monthlyEconomicSummary(transactions, currentKey);
  const previousMonthly = monthlyEconomicSummary(transactions, previousKey);
'''
new_ctx = '''  const [canonicalCurrent, canonicalPrevious] = await Promise.all([
    loadCanonicalMonthFacts(supabase, currentKey),
    loadCanonicalMonthFacts(supabase, previousKey),
  ]);
  const currentCategories = canonicalCurrent
    ? canonicalCategoryPairs(canonicalCurrent.categories)
    : categoryTotals(expenses, currentKey);
  const previousCategories = canonicalPrevious
    ? canonicalCategoryPairs(canonicalPrevious.categories)
    : categoryTotals(expenses, previousKey);
  const currentDetailedCategories = detailedCategoryTotals(expenses, currentKey);
  const previousDetailedCategories = detailedCategoryTotals(expenses, previousKey);
  const currentCategoryExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousCategoryExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);

  // Fonte autoritativa: mesma RPC usada pela Home/monitoramento. O cálculo local
  // fica apenas como fallback para indisponibilidade transitória da RPC.
  const currentMonthly = monthlyFromCanonical(canonicalCurrent, monthlyEconomicSummary(transactions, currentKey));
  const previousMonthly = monthlyFromCanonical(canonicalPrevious, monthlyEconomicSummary(transactions, previousKey));
'''
if old_ctx not in text:
    raise SystemExit('context calculations anchor not found')
text = text.replace(old_ctx, new_ctx, 1)

old_requested = '''    const requestedMonthly = monthlyEconomicSummary(transactions, requested.key);
    const requestedCategories = categoryTotals(expenses, requested.key);
'''
new_requested = '''    const canonicalRequested = await loadCanonicalMonthFacts(supabase, requested.key);
    const requestedMonthly = monthlyFromCanonical(canonicalRequested, monthlyEconomicSummary(transactions, requested.key));
    const requestedCategories = canonicalRequested
      ? canonicalCategoryPairs(canonicalRequested.categories)
      : categoryTotals(expenses, requested.key);
'''
if old_requested not in text:
    raise SystemExit('requested period anchor not found')
text = text.replace(old_requested, new_requested, 1)

# Make the source hierarchy explicit to the LLM without changing response style.
old_prompt = '''Regras financeiras obrigatórias:
- Use SOMENTE os dados financeiros fornecidos no contexto; nunca invente valores.
'''
new_prompt = '''Regras financeiras obrigatórias:
- Use SOMENTE os dados financeiros fornecidos no contexto; nunca invente valores.
- Os totais marcados como MESMA REGRA DA HOME/TRANSAÇÕES e Gastos por categoria vêm do motor financeiro canônico do Cofre360 (RPC financial_month_facts). Eles são fatos autoritativos. Use os detalhes item a item somente para explicar esses fatos; nunca recalcule ou substitua os totais canônicos por uma soma improvisada.
'''
if old_prompt not in text:
    raise SystemExit('system prompt anchor not found')
text = text.replace(old_prompt, new_prompt, 1)

p.write_text(text)
print('financial-chat canonical facts patch applied')
