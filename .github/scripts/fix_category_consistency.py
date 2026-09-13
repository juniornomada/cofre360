from pathlib import Path

p = Path('src/routes/transactions.tsx')
s = p.read_text()

old = '''  const filtered = filterType === "all"
    ? filteredWithoutType
    : economicFilteredWithoutType.filter((tx) => {
        const kind = getEconomicSummaryKind(tx);
        if (filterType === "income") return kind === "income";
        return kind === "expense" || kind === "refund";
      });
'''

new = '''  const rawFiltered = filterType === "all"
    ? filteredWithoutType
    : economicFilteredWithoutType.filter((tx) => {
        const kind = getEconomicSummaryKind(tx);
        if (filterType === "income") return kind === "income";
        return kind === "expense" || kind === "refund";
      });

  // Every category surface must use the same economic-purchase ledger: original
  // purchase date + full purchase amount once. This keeps Insights IA, the
  // category charts and category-scoped summary cards numerically identical.
  const categoryEconomicRows = categoryLedgerTransactions.filter((tx) => {
    if (tx.is_visible === false) return false;

    const categoryValue = String(tx.category || "Outros");
    const parsedCategory = parseCategoryValue(categoryValue);
    const isRefund = categoryValue.trim() === "Receita > Reembolso";
    const isIgnoredCategory =
      parsedCategory.group === "Transferências" ||
      parsedCategory.group === "Pagamento de Cartão" ||
      parsedCategory.group === "Ajustes";
    if (isIgnoredCategory) return false;

    const rowType = tx.type === "income" ? "income" : tx.type === "expense" ? "expense" : null;
    if (!rowType) return false;

    const matchesCategory =
      activeCategory === "Todas" ||
      categoryValue === activeCategory ||
      parsedCategory.group === activeCategory ||
      (activeCategory === "Reembolso" && isRefund);
    if (!matchesCategory) return false;

    const matchesSource = activeSource === "all"
      ? true
      : activeSource === "card"
        ? !!tx.card
        : !!tx.bank_account_id && !tx.card;
    if (!matchesSource) return false;

    if (filterAccountId && tx.bank_account_id !== filterAccountId) return false;

    const amount = Number(tx.amount || 0);
    if (minAmt !== null && amount < minAmt) return false;
    if (maxAmt !== null && amount > maxAmt) return false;

    const d = parseTxDate(tx.date || "", tx.created_at || undefined);
    const timestamp = d?.getTime() ?? NaN;
    if (!Number.isFinite(timestamp) || timestamp < selectedMonthStartUtc || timestamp > selectedMonthEndUtc) return false;

    if (filterStartDate && timestamp < toUtcDay(filterStartDate).getTime()) return false;
    if (filterEndDate && timestamp > toUtcDay(filterEndDate, true).getTime()) return false;

    if (filterType === "income") return rowType === "income" && !isRefund;
    if (filterType === "expense") return rowType === "expense" || isRefund;
    return true;
  });

  // Rows above are already collapsed to one economic purchase. Clear installment
  // metadata before sending them to CategoryPieCharts so it does not expand them
  // a second time.
  const categoryChartTransactions = categoryEconomicRows.map((tx) => ({
    id: tx.id,
    category: String(tx.category || "Outros"),
    amount: Number(tx.amount || 0),
    type: tx.type === "income" ? "income" as const : "expense" as const,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    installment_source_amount: null,
  }));

  const categoryScopeActive = !isYieldView && activeCategory !== "Todas";
  const filtered = rawFiltered;
'''

if old not in s:
    raise SystemExit('filtered marker missing')
s = s.replace(old, new, 1)

old2 = '''  const totalExpense = grossExpense - refundAmount;

  const generatePDF = () => {'''
new2 = '''  const totalExpense = grossExpense - refundAmount;

  const categoryScopedIncome = categoryEconomicRows
    .filter((tx) => tx.type === "income" && String(tx.category || "").trim() !== "Receita > Reembolso")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const categoryScopedGrossExpense = categoryEconomicRows
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const categoryScopedRefund = categoryEconomicRows
    .filter((tx) => String(tx.category || "").trim() === "Receita > Reembolso")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const displayTotalIncome = categoryScopeActive ? categoryScopedIncome : totalIncome;
  const displayTotalExpense = categoryScopeActive
    ? categoryScopedGrossExpense - categoryScopedRefund
    : totalExpense;

  const generatePDF = () => {'''

if old2 not in s:
    raise SystemExit('totals marker missing')
s = s.replace(old2, new2, 1)

old_income = '{balanceVisible ? `R$ ${formatCurrency(totalIncome)}` : "R$ ••••"}'
new_income = '{balanceVisible ? `R$ ${formatCurrency(displayTotalIncome)}` : "R$ ••••"}'
if old_income not in s:
    raise SystemExit('income total marker missing')
s = s.replace(old_income, new_income, 1)

s = s.replace('!isYieldView && totalExpense < 0', '!isYieldView && displayTotalExpense < 0')
s = s.replace('totalExpense < 0 ? "Saldo reembolsos" : "Despesas"', 'displayTotalExpense < 0 ? "Saldo reembolsos" : "Despesas"')
s = s.replace('!isYieldView && totalExpense < 0 ? "text-primary" : "text-destructive"', '!isYieldView && displayTotalExpense < 0 ? "text-primary" : "text-destructive"')
s = s.replace(
    '!isYieldView && totalExpense < 0\n                  ? `+ R$ ${formatCurrency(Math.abs(totalExpense))}`\n                  : `R$ ${formatCurrency(totalExpense)}`',
    '!isYieldView && displayTotalExpense < 0\n                  ? `+ R$ ${formatCurrency(Math.abs(displayTotalExpense))}`\n                  : `R$ ${formatCurrency(displayTotalExpense)}`',
)

old_chart = '          transactions={filtered}\n'
if old_chart not in s:
    raise SystemExit('chart source marker missing')
s = s.replace(old_chart, '          transactions={categoryChartTransactions}\n', 1)

p.write_text(s)
