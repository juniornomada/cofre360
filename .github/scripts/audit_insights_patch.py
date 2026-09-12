from pathlib import Path

# Suggestions shown on Insights.
p = Path('src/routes/insights.tsx')
s = p.read_text()
start = s.index('const SUGGESTED_QUESTIONS = [')
end = s.index('];', start) + 2
s = s[:start] + '''const SUGGESTED_QUESTIONS = [
  "Como estão minhas finanças este mês?",
  "Qual foi o gasto total deste mês?",
  "Quais categorias tiveram mais gastos neste mês?",
  "Como os gastos de Alimentação estão divididos por subcategoria neste mês?",
  "Quais parcelas de compras antigas foram cobradas neste mês?",
  "Qual foi o total de receitas deste mês?",
  "Compare as compras realizadas neste mês com o mês passado.",
  "Qual a diferença entre gasto econômico e movimentação financeira?",
];''' + s[end:]
p.write_text(s)

# Reusable chat fallback suggestions.
p = Path('src/components/FinancialChat.tsx')
s = p.read_text()
start = s.index('const SUGGESTIONS = [')
end = s.index('];', start) + 2
s = s[:start] + '''const SUGGESTIONS = [
  "Como estão minhas finanças este mês?",
  "Qual foi o gasto total deste mês?",
  "Quais categorias tiveram mais gastos neste mês?",
  "Quais parcelas de compras antigas foram cobradas neste mês?",
];''' + s[end:]
p.write_text(s)

# Financial Chat backend.
p = Path('supabase/functions/financial-chat/index.ts')
s = p.read_text()

def replace_once(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f'{label} anchor not found')
    s = s.replace(old, new, 1)

replace_once('''type EconomicExpense = {
  name: string;
  category: string;
  amount: number;
  date: Date;
};''', '''type EconomicExpense = {
  name: string;
  category: string;
  amount: number;
  date: Date;
  card?: string | null;
};''', 'EconomicExpense')

replace_once('''    output.push({
      name: String(tx.name || "Transação"),
      category: String(tx.category || "Outros"),
      amount: Number(tx.amount || 0),
      date,
    });''', '''    output.push({
      name: String(tx.name || "Transação"),
      category: String(tx.category || "Outros"),
      amount: Number(tx.amount || 0),
      date,
      card: tx.card,
    });''', 'single economic row')

replace_once('''    output.push({
      name: String(first.name || "Transação parcelada"),
      category: String(first.category || "Outros"),
      amount,
      date,
    });''', '''    output.push({
      name: String(first.name || "Transação parcelada"),
      category: String(first.category || "Outros"),
      amount,
      date,
      card: first.card,
    });''', 'group economic row')

helper_start = s.index('function oldInstallmentCategoryTotals(')
helper_end = s.index('\n}\n', helper_start) + 3
helpers = r'''function detailedCategoryTotals(rows: EconomicExpense[], key: string) {
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
    if (!purchaseDate || monthKey(purchaseDate) === key) continue;
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
'''
s = s[:helper_start] + helpers + s[helper_end:]

replace_once('''  const currentNormalized = norm(currentQuestion).replace(/[!?.,:;]+$/g, "").trim();
  const detailOnly = /^(detalhe|detalhar|detalha|mostre os detalhes|mostrar detalhes)$/.test(currentNormalized);
  const previousQuestion = userMessages.length > 1 ? userMessages[userMessages.length - 2]?.content || "" : "";
  const anchorQuestion = detailOnly && previousQuestion ? previousQuestion : currentQuestion;
  const q = norm(anchorQuestion);''', '''  const currentNormalized = norm(currentQuestion).replace(/[!?.,:;]+$/g, "").trim();
  const detailOnly = /^\\/?(detalhe|detalhar|detalha|mostre os detalhes|mostrar detalhes)$/.test(currentNormalized);
  const contextualSubcategoryOnly = /^(em quais categorias|em quais subcategorias|quais subcategorias|como esta dividido|como estão divididos|como estao divididos)$/.test(currentNormalized);
  const previousQuestion = userMessages.length > 1 ? userMessages[userMessages.length - 2]?.content || "" : "";
  const anchorQuestion = (detailOnly || contextualSubcategoryOnly) && previousQuestion
    ? `${previousQuestion} ${currentQuestion}`
    : currentQuestion;
  const q = norm(anchorQuestion);''', 'context anchor')

replace_once('''  // Perguntas analíticas continuam com a IA. Este caminho é somente para números objetivos.
  if (!detailOnly && /(reduzir|economizar|dicas?|recomend|projec|compar|aument|diminu|por que|porque|como posso|analise|análise)/.test(q)) {
    return null;
  }

  const asksOldInstallmentCategories =
    /(parcelas?.*(compras?|gastos?).*(antig|anterior)|compras? .*antig.*parcelas?|parcelas? .*mes(es)? anterior)/.test(q) &&
    /(categor|respons|quais|origem|vieram|onde)/.test(q);
  const asksCategoryBreakdown = /(gastos? por categoria|em quais categorias|quais categorias|categorias? .*gastei|gastei .*categorias?)/.test(q);
  const asksObjectiveAmount = /(quanto .*gastei|quanto gastei|qual .*gasto|gasto total|gastos totais|total .*despesas?|despesas? .*mes|despesas? .*mês|despesas? em |despesas? de )/.test(q);
  const asksEconomicVsExpenseConcept =
    /(gasto economico|gasto real|despesa economica)/.test(q) &&
    /(despesas?|saida|movimentacao|fluxo de caixa|pagamento)/.test(q) &&
    /(diferenca|diferente|qual e|o que muda)/.test(q);
  if (!detailOnly && !asksOldInstallmentCategories && !asksCategoryBreakdown && !asksObjectiveAmount && !asksEconomicVsExpenseConcept) return null;''', '''  // Conselhos e projeções continuam com a IA; números, comparações e composições usam cálculo determinístico.
  if (!detailOnly && /(reduzir|economizar|dicas?|recomend|projec|por que|porque|como posso|analise|análise)/.test(q)) return null;

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
  const asksEconomicVsExpenseConcept =
    /(gasto economico|gasto real|despesa economica)/.test(q) &&
    /(despesas?|saida|movimentacao|fluxo de caixa|pagamento)/.test(q) &&
    /(diferenca|diferente|qual e|o que muda)/.test(q);
  if (!detailOnly && !asksOldInstallmentCategories && !asksCategoryBreakdown && !asksSubcategoryBreakdown && !asksObjectiveAmount && !asksIncomeAmount && !asksFinancialSummary && !asksPurchaseComparison && !asksExpenseComposition && !asksEconomicVsExpenseConcept) return null;''', 'intents')

replace_once('''  const now = brNow();
  const requested = requestedMonth(anchorQuestion, now);
  const key = requested?.key || monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const label = requested?.label || `${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()}`;
  const monthly = monthlyEconomicSummary(transactions, key);
  const categories = categoryTotals(expenses, key);
  const categoryTotal = roundMoney(categories.reduce((sum, [, value]) => sum + value, 0));
  const oldInstallmentCategories = oldInstallmentCategoryTotals(transactions, key);
  const oldInstallmentTotal = roundMoney(oldInstallmentCategories.reduce((sum, [, value]) => sum + value, 0));''', '''  const now = brNow();
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
  const detailedCategories = detailedCategoryTotals(expenses, key);''', 'deterministic calculations')

old_start = s.index('  if (asksOldInstallmentCategories && !detailOnly) {')
old_end = s.index('\n  if (asksEconomicVsExpenseConcept', old_start)
answer = r'''  if (asksOldInstallmentCategories) {
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
'''
s = s[:old_start] + answer + s[old_end:]

marker = '''  const allCategoryNames = Array.from(new Set(expenses.map((row) => rootCategory(row.category))));
  const matchedCategory = allCategoryNames
    .sort((a, b) => b.length - a.length)
    .find((category) => {
      const needle = norm(category);
      return needle.length >= 3 && q.includes(needle);
    });
'''
if marker not in s:
    raise SystemExit('matched category marker not found')
branches = r'''
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

  if (matchedCategory && asksSubcategoryBreakdown && !detailOnly) {
    const subcategories = subcategoryTotals(expenses, key, matchedCategory);
    const value = roundMoney(subcategories.reduce((sum, [, amount]) => sum + amount, 0));
    const lines = subcategories.length ? subcategories.map(([subcategory, amount]) => `- **${subcategory} — R$ ${formatBRL(amount)}**`).join("\n") : "(sem compras no período)";
    return `### ${categoryEmoji(matchedCategory)} ${matchedCategory} por subcategoria — ${label}\n\n**Total: R$ ${formatBRL(value)}**\n\n${lines}\n\n> 💡 A soma das subcategorias fecha com o total econômico de ${matchedCategory} no período.`;
  }
'''
s = s.replace(marker, marker + branches, 1)

replace_once('''  if (detailOnly) {
    return `### 📊 Detalhamento — ${label}\n\n**💳 DESPESAS do mês: R$ ${formatBRL(monthly.expense)}**\n\nEsse é o valor do card **DESPESAS** e considera os lançamentos/parcelas que pertencem ao mês da cobrança.\n\n**🧾 Compras realizadas no mês por categoria: R$ ${formatBRL(categoryTotal)}**\n\n${categoryLines}\n\n> 💡 Os dois totais **não precisam ser iguais**: parcelas de compras de meses anteriores entram nas DESPESAS do mês, mas não são contabilizadas novamente como gasto da categoria.`;
  }''', '''  if (detailOnly) {
    const monthlyLines = monthly.breakdown.length
      ? monthly.breakdown.map(([category, amount]) => `- **${category}: ${amount < 0 ? "-" : ""}R$ ${formatBRL(Math.abs(amount))}**`).join("\\n")
      : "(sem despesas no período)";
    return `### 📊 Detalhamento — ${label}\n\n**💳 DESPESAS do mês: R$ ${formatBRL(monthly.expense)}**\n\n${monthlyLines}\n\n**🧾 Compras realizadas no mês por categoria: R$ ${formatBRL(categoryTotal)}**\n\n${categoryLines}\n\n> 💡 Os dois totais usam bases diferentes e **não precisam ser iguais**. Para identificar parcelas antigas, use o detalhamento específico de parcelas; não faça uma subtração entre os dois totais.`;
  }''', 'generic detail')

replace_once('''  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
  const currentCategoryExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousCategoryExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);''', '''  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
  const currentDetailedCategories = detailedCategoryTotals(expenses, currentKey);
  const previousDetailedCategories = detailedCategoryTotals(expenses, previousKey);
  const currentCategoryExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousCategoryExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);''', 'context calculations')

replace_once('''  const previousCategoryLines = previousCategories.slice(0, 15)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\\n");''', '''  const previousCategoryLines = previousCategories.slice(0, 15)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\\n");
  const currentDetailedCategoryLines = currentDetailedCategories.slice(0, 30)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\\n");
  const previousDetailedCategoryLines = previousDetailedCategories.slice(0, 30)
    .map(([category, amount]) => `- ${category}: R$ ${formatBRL(amount)}`)
    .join("\\n");''', 'context detail lines')

replace_once('''${currentCategoryLines || "(sem despesas)"}

### Mês anterior — ${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()} — MESMA REGRA DA HOME/TRANSAÇÕES''', '''${currentCategoryLines || "(sem despesas)"}

#### Detalhe real por categoria/subcategoria — compras do mês atual
${currentDetailedCategoryLines || "(sem despesas)"}

### Mês anterior — ${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()} — MESMA REGRA DA HOME/TRANSAÇÕES''', 'current detail context')

replace_once('''${previousCategoryLines || "(sem despesas)"}

### Contas — saldo calculado''', '''${previousCategoryLines || "(sem despesas)"}

#### Detalhe real por categoria/subcategoria — compras do mês anterior
${previousDetailedCategoryLines || "(sem despesas)"}

### Contas — saldo calculado''', 'previous detail context')

prompt_anchor = '- NUNCA use a "Composição das DESPESAS pelo mês de cobrança/lançamento" como se fosse gasto novo por categoria. Ela serve apenas para explicar quais parcelas/lançamentos compõem o card mensal de DESPESAS e pode incluir compras de meses anteriores.'
if prompt_anchor not in s:
    raise SystemExit('prompt anchor not found')
s = s.replace(prompt_anchor, prompt_anchor + '''
- NUNCA estime parcelas de compras antigas subtraindo DESPESAS de Gastos por categoria. Identifique parcelas antigas somente pelos lançamentos reais cuja cobrança está no período e cuja data original da compra é anterior ao período.
- A seção "Transações recentes" é apenas uma amostra de referência e pode ser incompleta. NUNCA faça uma soma exaustiva, reconciliação ou conclusão de ausência de lançamentos usando somente essa amostra; prefira os totais pré-calculados e o detalhe real por categoria/subcategoria.
- Não invente a natureza de uma diferença entre totais e não use expressões como "provavelmente parcelas de...", "sugere..." ou "pode incluir..." sem transações explícitas que comprovem isso.
- Não classifique uma despesa como fixa, essencial, recorrente ou dispensável sem essa informação explícita nos dados ou sem o usuário ter confirmado.
- Se o usuário pedir uma subcategoria ou uma composição de categoria, use o "Detalhe real por categoria/subcategoria" e garanta que a soma feche com o total da categoria.''', 1)

projection_anchor = '- Diferencie gasto econômico de movimentação de caixa/fatura quando isso for relevante.'
if projection_anchor not in s:
    raise SystemExit('projection prompt anchor not found')
s = s.replace(projection_anchor, projection_anchor + '''
- Para projeção de saldo/fim do mês, só forneça um valor projetado se o contexto contiver entradas e saídas futuras suficientes para calculá-lo. Caso contrário, diga que não há base confiável para uma projeção e mostre apenas os valores atuais disponíveis.''', 1)

gen_start = s.index('async function generateSuggestions(')
gen_end = s.index('\n}\n\nserve(async', gen_start) + 3
generator = r'''const AUDITED_SUGGESTIONS = [
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
  if (/parcelas?.*(antig|anterior)/.test(last)) {
    preferred = [AUDITED_SUGGESTIONS[7], AUDITED_SUGGESTIONS[2], AUDITED_SUGGESTIONS[6], ...AUDITED_SUGGESTIONS];
  } else if (/categoria|alimentacao|alimentação/.test(last)) {
    preferred = [AUDITED_SUGGESTIONS[3], AUDITED_SUGGESTIONS[4], AUDITED_SUGGESTIONS[6], ...AUDITED_SUGGESTIONS];
  } else if (/receita|despesa|gasto total|financas|finanças/.test(last)) {
    preferred = [AUDITED_SUGGESTIONS[2], AUDITED_SUGGESTIONS[4], AUDITED_SUGGESTIONS[7], ...AUDITED_SUGGESTIONS];
  }
  return preferred.filter((item, index, arr) => arr.indexOf(item) === index && norm(item) !== last).slice(0, 3);
}
'''
s = s[:gen_start] + generator + s[gen_end:]
p.write_text(s)

# Regression suite.
p = Path('supabase/functions/run-ai-tests/index.ts')
s = p.read_text()

def t_replace(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f'test {label} anchor not found')
    s = s.replace(old, new, 1)

t_replace('''interface TestCase {
  id: string;
  name: string;
  query: string;
  expectedKeywords: string[];
  category: string;
}''', '''interface TestCase {
  id: string;
  name: string;
  query?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  expectedKeywords: string[];
  forbiddenKeywords?: string[];
  category: string;
}''', 'interface')

start = s.index('const TEST_SUITE: TestCase[] = [')
end = s.index('];', start) + 2
s = s[:start] + '''const TEST_SUITE: TestCase[] = [
  { id: "1", name: "Resumo financeiro atual", query: "Como estão minhas finanças este mês?", expectedKeywords: ["receitas", "despesas", "resultado", "R$"], category: "Resumo" },
  { id: "2", name: "Gasto total atual", query: "Qual foi o gasto total deste mês?", expectedKeywords: ["despesas", "total", "R$"], category: "Resumo" },
  { id: "3", name: "Categorias atuais", query: "Quais categorias tiveram mais gastos neste mês?", expectedKeywords: ["gastos por categoria", "compras realizadas", "R$"], category: "Categorias" },
  { id: "4", name: "Subcategorias de alimentação", query: "Como os gastos de Alimentação estão divididos por subcategoria neste mês?", expectedKeywords: ["alimentação", "subcategoria", "total", "R$"], category: "Categorias" },
  { id: "5", name: "Parcelas antigas exatas", query: "Quais parcelas de compras antigas foram cobradas neste mês?", expectedKeywords: ["parcelas de compras antigas", "total", "compra", "R$"], forbiddenKeywords: ["representa principalmente", "sugere parcelas", "calculado pela diferença"], category: "Parcelas" },
  { id: "6", name: "Receitas atuais", query: "Qual foi o total de receitas deste mês?", expectedKeywords: ["receitas", "total", "R$"], category: "Resumo" },
  { id: "7", name: "Comparação econômica", query: "Compare as compras realizadas neste mês com o mês passado.", expectedKeywords: ["comparativo", "compras realizadas", "diferença", "R$"], category: "Comparação" },
  { id: "8", name: "Conceito econômico x caixa", query: "Qual a diferença entre gasto econômico e movimentação financeira?", expectedKeywords: ["movimentação", "transferências", "pagamentos", "R$"], category: "Conceito" },
  { id: "9", name: "Follow-up contextual de alimentação", messages: [{ role: "user", content: "Quanto gastei com alimentação?" }, { role: "assistant", content: "Total de Alimentação informado." }, { role: "user", content: "Em quais categorias?" }], expectedKeywords: ["alimentação", "subcategoria", "total", "R$"], category: "Contexto" },
  { id: "10", name: "Follow-up detalhe de parcelas antigas", messages: [{ role: "user", content: "Quais categorias foram responsáveis pelas parcelas de compras antigas?" }, { role: "assistant", content: "Resumo das categorias informado." }, { role: "user", content: "detalhe" }], expectedKeywords: ["detalhe", "parcelas de compras antigas", "compra", "R$"], forbiddenKeywords: ["representa principalmente", "sugere parcelas"], category: "Contexto" },
  { id: "11", name: "Composição sem subtração indevida", query: "Quais foram as despesas que não entraram nos gastos por categoria?", expectedKeywords: ["composição", "parcelas de compras antigas", "importante", "R$"], forbiddenKeywords: ["provavelmente parcelas", "sugere parcelas"], category: "Reconciliação" },
];''' + s[end:]

t_replace('async function runOne(test: TestCase, chatUrl: string, authKey: string) {', 'async function runOne(test: TestCase, chatUrl: string, authKey: string, anonKey: string) {', 'runOne signature')
t_replace('''        Authorization: `Bearer ${authKey}`,
        apikey: authKey,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: test.query }] }),''', '''        Authorization: `Bearer ${authKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ messages: test.messages || [{ role: "user", content: test.query || "" }] }),''', 'request')
t_replace('''    const accuracy = Math.round((matches / test.expectedKeywords.length) * 100);

    let consistency = 100;''', '''    for (const kw of test.forbiddenKeywords || []) {
      if (lower.includes(kw.toLowerCase())) {
        findings.push(`❌ conteúdo proibido: ${kw}`);
        matches = Math.max(0, matches - 1);
      }
    }
    const accuracy = Math.round((matches / test.expectedKeywords.length) * 100);

    let consistency = 100;''', 'scoring')
t_replace('results.push(await runOne(t, chatUrl, token));', 'results.push(await runOne(t, chatUrl, token, ANON_KEY));', 'invocation')
p.write_text(s)

print('Insights IA audit patch applied')
