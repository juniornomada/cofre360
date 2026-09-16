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

      const replacement = `  // Category drilldowns and the explicit Card source use the economic purchase
  // ledger. This keeps the visible list, totals and category chart on the same
  // purchase-date/full-value basis, including legacy card purchases whose stored
  // installment rows only start in a later month.
  const categoryScopeActive = !isYieldView && (activeCategory !== "Todas" || activeSource === "card");

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

      let transformed = code.replace(marker, replacement);

      // Keep every category filter on one compact row on mobile. The container
      // shrinks to the icon group when it fits and becomes horizontally
      // scrollable only on very narrow screens or when more categories exist.
      const categoryRowClass = 'className="flex flex-wrap justify-center gap-1.5"';
      const compactCategoryRowClass = 'className="mx-auto flex w-fit max-w-full flex-nowrap items-center gap-1 overflow-x-auto px-0.5"';
      if (!transformed.includes(categoryRowClass)) {
        throw new Error("Category icon row marker not found in transformed transactions.tsx");
      }
      transformed = transformed.replace(categoryRowClass, compactCategoryRowClass);

      const categoryButtonClass = 'className={`interactive-button flex h-9 w-12 shrink-0 items-center justify-center rounded-xl border text-base transition-all ${';
      const compactCategoryButtonClass = 'className={`interactive-button flex h-9 w-10 shrink-0 items-center justify-center rounded-xl border text-base transition-all ${';
      if (!transformed.includes(categoryButtonClass)) {
        throw new Error("Category icon button marker not found in transformed transactions.tsx");
      }
      transformed = transformed.replace(categoryButtonClass, compactCategoryButtonClass);

      return { code: transformed, map: null };
    },
  };
}
