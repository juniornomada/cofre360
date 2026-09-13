import type { Plugin } from "vite";

const FILTERED_BLOCK = `  const filtered = filterType === "all"
    ? filteredWithoutType
    : economicFilteredWithoutType.filter((tx) => {
        const kind = getEconomicSummaryKind(tx);
        if (filterType === "income") return kind === "income";
        return kind === "expense" || kind === "refund";
      });
`;

const FILTERED_REPLACEMENT = `  const rawFiltered = filterType === "all"
    ? filteredWithoutType
    : economicFilteredWithoutType.filter((tx) => {
        const kind = getEconomicSummaryKind(tx);
        if (filterType === "income") return kind === "income";
        return kind === "expense" || kind === "refund";
      });

  // Single source of truth for every category view: original purchase date
  // plus the full economic purchase amount, counted once.
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

  // The ledger is already collapsed. Clear installment metadata before sending
  // it to the chart so it cannot expand the same purchase a second time.
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
`;

const TOTAL_BLOCK = `  const totalExpense = grossExpense - refundAmount;

  const generatePDF = () => {`;

const TOTAL_REPLACEMENT = `  const totalExpense = grossExpense - refundAmount;

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

  const generatePDF = () => {`;

export function categoryConsistencyHotfix(): Plugin {
  return {
    name: "cofre360-category-consistency-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/routes/transactions.tsx")) return null;

      // Once the source patch lands, this build hotfix becomes a no-op.
      if (code.includes("const categoryEconomicRows = categoryLedgerTransactions.filter")) return null;

      if (!code.includes(FILTERED_BLOCK) || !code.includes(TOTAL_BLOCK)) {
        throw new Error("Category consistency hotfix markers not found in transactions.tsx");
      }

      let next = code.replace(FILTERED_BLOCK, FILTERED_REPLACEMENT);
      next = next.replace(TOTAL_BLOCK, TOTAL_REPLACEMENT);
      next = next.replace(
        '{balanceVisible ? `R$ ${formatCurrency(totalIncome)}` : "R$ ••••"}',
        '{balanceVisible ? `R$ ${formatCurrency(displayTotalIncome)}` : "R$ ••••"}',
      );
      next = next.replaceAll("!isYieldView && totalExpense < 0", "!isYieldView && displayTotalExpense < 0");
      next = next.replaceAll('totalExpense < 0 ? "Saldo reembolsos" : "Despesas"', 'displayTotalExpense < 0 ? "Saldo reembolsos" : "Despesas"');
      next = next.replaceAll(
        '!isYieldView && totalExpense < 0 ? "text-primary" : "text-destructive"',
        '!isYieldView && displayTotalExpense < 0 ? "text-primary" : "text-destructive"',
      );
      next = next.replace(
        '!isYieldView && displayTotalExpense < 0\n                  ? `+ R$ ${formatCurrency(Math.abs(totalExpense))}`\n                  : `R$ ${formatCurrency(totalExpense)}`',
        '!isYieldView && displayTotalExpense < 0\n                  ? `+ R$ ${formatCurrency(Math.abs(displayTotalExpense))}`\n                  : `R$ ${formatCurrency(displayTotalExpense)}`',
      );
      next = next.replace(
        "          transactions={filtered}\n",
        "          transactions={categoryChartTransactions}\n",
      );

      if (!next.includes("transactions={categoryChartTransactions}")) {
        throw new Error("Category consistency hotfix did not switch chart data source");
      }

      return { code: next, map: null };
    },
  };
}
