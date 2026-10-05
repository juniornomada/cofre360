export function computeCardConsistency(
  transactions: FinancialTransaction[],
  cards: FinancialCard[],
  targetMonthKey: string,
) {
  const byCard = new Map<string, number>();

  const economicExpenses = collapseCategorySpendingRows(
    transactions.filter((tx) => tx.is_visible !== false && inferTransactionKind(tx) === "expense"),
  );

  for (const tx of economicExpenses) {
    const date = canonicalTransactionDate({
      transaction_date: tx.purchase_date || tx.date || null,
      date: tx.purchase_date || tx.date || null,
      created_at: tx.created_at || null,
    });
    if (!date || monthKeyFromDate(date) !== targetMonthKey) continue;
    if (!tx.card && !tx.card_id) continue;

    const card = cardForTransaction(tx, cards);
    const label = card?.name || tx.card || "Cartão";
    const amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount)) continue;
    byCard.set(label, (byCard.get(label) || 0) + amount);
  }

  for (const tx of transactions) {
    if (tx.is_visible === false || inferTransactionKind(tx) !== "refund") continue;
    if (!tx.card && !tx.card_id) continue;
    const date = canonicalTransactionDate(tx);
    if (!date || monthKeyFromDate(date) !== targetMonthKey) continue;

    const card = cardForTransaction(tx, cards);
    const label = card?.name || tx.card || "Cartão";
    const amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount)) continue;
    byCard.set(label, (byCard.get(label) || 0) - amount);
  }

  const cardsTotal = [...byCard.values()].reduce((sum, value) => sum + value, 0);
  const expected = computeMonthlyFinancialSummary(transactions, cards, targetMonthKey).cardExpenseComponent;
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return {
    cards: [...byCard.entries()]
      .map(([card, amount]) => ({ card, amount: round(amount) }))
      .filter((item) => Math.abs(item.amount) >= 0.005)
      .sort((a, b) => b.amount - a.amount),
    cardsTotal: round(cardsTotal),
    expenseCardComponent: round(expected),
    delta: round(cardsTotal - expected),
    isConsistent: Math.abs(round(cardsTotal - expected)) < 0.01,
  };
}

