from pathlib import Path

p = Path("supabase/functions/financial-chat/index.ts")
s = p.read_text()

if "type MonthlyEconomicSummary =" not in s:
    marker = "function shiftMonths(date: Date, delta: number) {"
    helper = '''type MonthlyEconomicSummary = {
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
    .join("\\n");
}

'''
    if marker not in s:
        raise SystemExit("shiftMonths marker not found")
    s = s.replace(marker, helper + marker, 1)

old_calc = '''  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
  const currentExpense = currentCategories.reduce((sum, [, value]) => sum + value, 0);
  const previousExpense = previousCategories.reduce((sum, [, value]) => sum + value, 0);

  const rawIncomeForKey = (key: string) => transactions
    .filter((tx) => tx.is_visible !== false && tx.type === "income" && !isTransferOrCardPayment(tx.category))
    .filter((tx) => {
      const date = parseTxDate(tx.date, tx.created_at);
      return date && monthKey(date) === key;
    })
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const currentIncome = rawIncomeForKey(currentKey);
  const previousIncome = rawIncomeForKey(previousKey);
'''
new_calc = '''  const currentCategories = categoryTotals(expenses, currentKey);
  const previousCategories = categoryTotals(expenses, previousKey);
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
'''
if old_calc not in s:
    raise SystemExit("calculation block not found")
s = s.replace(old_calc, new_calc, 1)

old_req = '''  const requested = requestedMonth(question, now);
  let requestedSection = "";
  if (requested && requested.key !== currentKey && requested.key !== previousKey) {
    const requestedCategories = categoryTotals(expenses, requested.key);
    const requestedTotal = requestedCategories.reduce((sum, [, value]) => sum + value, 0);
    requestedSection = `\\n### Período solicitado: ${requested.label}\\n- Despesas: R$ ${formatBRL(requestedTotal)}\\n${requestedCategories.slice(0, 15).map(([c, v]) => `- ${c}: R$ ${formatBRL(v)}`).join("\\n") || "(sem despesas)"}`;
  }
'''
new_req = '''  const requested = requestedMonth(question, now);
  let requestedSection = "";
  if (requested && requested.key !== currentKey && requested.key !== previousKey) {
    const requestedMonthly = monthlyEconomicSummary(transactions, requested.key);
    const requestedCategories = categoryTotals(expenses, requested.key);
    const requestedCategoryTotal = requestedCategories.reduce((sum, [, value]) => sum + value, 0);
    requestedSection = `\\n### Período solicitado — ${requested.label} — MESMA REGRA DA HOME/TRANSAÇÕES
- Receitas: R$ ${formatBRL(requestedMonthly.income)}
- Despesas: R$ ${formatBRL(requestedMonthly.expense)}
- Resultado: R$ ${formatBRL(requestedMonthly.income - requestedMonthly.expense)}

#### Detalhamento das DESPESAS do período — fecha com o total acima
${formatMonthlyBreakdown(requestedMonthly) || "(sem despesas)"}

#### Gastos por categoria no mês da compra — visão de categorias, pode diferir do total mensal
- Total por categorias no mês da compra: R$ ${formatBRL(requestedCategoryTotal)}
${requestedCategories.slice(0, 15).map(([c, v]) => `- ${c}: R$ ${formatBRL(v)}`).join("\\n") || "(sem despesas)"}`;
  }
'''
if old_req not in s:
    raise SystemExit("requested section not found")
s = s.replace(old_req, new_req, 1)

old_return = '''### Mês atual — ${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()}
- Receitas: R$ ${formatBRL(currentIncome)}
- Gastos econômicos por categoria: R$ ${formatBRL(currentExpense)}
- Saldo receitas - gastos: R$ ${formatBRL(currentIncome - currentExpense)}

#### Gastos por categoria no mês atual
${currentCategoryLines || "(sem despesas)"}

### Mês anterior — ${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()}
- Receitas: R$ ${formatBRL(previousIncome)}
- Gastos econômicos por categoria: R$ ${formatBRL(previousExpense)}

#### Gastos por categoria no mês anterior
${previousCategoryLines || "(sem despesas)"}
'''
new_return = '''### Mês atual — ${MONTHS_LABEL[now.getMonth()]}/${now.getFullYear()} — MESMA REGRA DA HOME/TRANSAÇÕES
- Receitas: R$ ${formatBRL(currentIncome)}
- Despesas: R$ ${formatBRL(currentExpense)}
- Resultado: R$ ${formatBRL(currentIncome - currentExpense)}

#### Detalhamento das DESPESAS do mês atual — fecha com o total acima
${currentMonthlyBreakdown || "(sem despesas)"}

#### Gastos por categoria no mês da compra — visão de categorias, pode diferir do total mensal
- Total por categorias no mês da compra: R$ ${formatBRL(currentCategoryExpense)}
${currentCategoryLines || "(sem despesas)"}

### Mês anterior — ${MONTHS_LABEL[previousDate.getMonth()]}/${previousDate.getFullYear()} — MESMA REGRA DA HOME/TRANSAÇÕES
- Receitas: R$ ${formatBRL(previousIncome)}
- Despesas: R$ ${formatBRL(previousExpense)}
- Resultado: R$ ${formatBRL(previousIncome - previousExpense)}

#### Detalhamento das DESPESAS do mês anterior — fecha com o total acima
${previousMonthlyBreakdown || "(sem despesas)"}

#### Gastos por categoria no mês da compra — visão de categorias, pode diferir do total mensal
- Total por categorias no mês da compra: R$ ${formatBRL(previousCategoryExpense)}
${previousCategoryLines || "(sem despesas)"}
'''
if old_return not in s:
    raise SystemExit("return summary block not found")
s = s.replace(old_return, new_return, 1)

anchor = '- Use SOMENTE os dados financeiros fornecidos no contexto; nunca invente valores.\n'
extra = '''- Quando o usuário perguntar "gasto total", "quanto gastei no mês", "despesas do mês" ou equivalente, use SEMPRE o valor "Despesas" da seção "MESMA REGRA DA HOME/TRANSAÇÕES". Esse é o mesmo número exibido nos cards do app.
- Se o usuário pedir "detalhe", "em quais categorias" ou continuação equivalente depois do total mensal, use "Detalhamento das DESPESAS do mês/período" e garanta que os itens reconciliem com o total. Reembolsos aparecem como abatimento negativo.
- NÃO use o "Total por categorias no mês da compra" como resposta para "gasto total/despesas do mês". Essa visão existe para análise econômica por categoria e pode diferir do card mensal por compras parceladas e data original da compra.
- Ajustes de saldo não são receita/despesa econômica; transferências internas e pagamentos de cartão também não. Reembolsos confirmados reduzem despesas e não contam como receita.
'''
if extra.strip() not in s:
    if anchor not in s:
        raise SystemExit("prompt anchor not found")
    s = s.replace(anchor, anchor + extra, 1)

p.write_text(s)
