import type { Plugin } from "vite";

export function categoryConsistencyListHotfix(): Plugin {
  return {
    name: "cofre360-category-consistency-list-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/routes/transactions.tsx")) return null;
      if (!code.includes("const categoryEconomicRows = categoryLedgerTransactions.filter")) return null;
      if (code.includes("const categoryListTransactions: Transaction[]")) return null;

      const marker = `  const categoryScopeActive = !isYieldView && activeCategory !== "Todas";
  const filtered = rawFiltered;
`;

      const replacement = `  const categoryScopeActive = !isYieldView && activeCategory !== "Todas";

  // When a category is selected, the visible list must close to the exact same
  // economic total shown by Insights IA, the chart and the summary card.
  const categoryListTransactions: Transaction[] = categoryEconomicRows.map((tx) => {
    const original = transactions.find((item) => item.id === tx.id);
    const categoryValue = String(tx.category || original?.category || "Outros");
    const group = parseCategoryValue(categoryValue).group || categoryValue;
    return {
      id: tx.id,
      icon: original?.icon || getCategoryIcon(group),
      name: tx.name || original?.name || "Transação",
      category: categoryValue,
      date: tx.date || tx.purchase_date || original?.date || "",
      purchase_date: tx.purchase_date ?? tx.date ?? original?.purchase_date ?? null,
      amount: Number(tx.amount || 0),
      type: tx.type === "income" ? "income" : "expense",
      card: tx.card ?? original?.card ?? null,
      cardBrand: tx.card ? (cardNameToBrand[tx.card] || original?.cardBrand || null) : null,
      bank_account_id: tx.bank_account_id ?? original?.bank_account_id ?? null,
      created_at: tx.created_at ?? original?.created_at,
      installment_group_id: tx.installment_group_id ?? original?.installment_group_id ?? null,
      installment_number: tx.installment_number ?? original?.installment_number ?? null,
      total_installments: tx.total_installments ?? original?.total_installments ?? null,
      installment_mode: (tx.installment_mode as Transaction["installment_mode"]) ?? original?.installment_mode ?? null,
      installment_source_amount: tx.installment_source_amount == null
        ? (original?.installment_source_amount ?? null)
        : Number(tx.installment_source_amount),
      is_visible: true,
    };
  });

  const filtered = categoryScopeActive ? categoryListTransactions : rawFiltered;
`;

      if (!code.includes(marker)) {
        throw new Error("Category list consistency marker not found in transformed transactions.tsx");
      }

      return { code: code.replace(marker, replacement), map: null };
    },
  };
}
