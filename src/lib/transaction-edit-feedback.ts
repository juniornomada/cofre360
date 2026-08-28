export type TransactionEditSource = {
  card?: string | null;
  installment_group_id?: string | null;
};

export type InstallmentEditResult = {
  cleared: boolean;
  futureRowsAdded: number;
};

/**
 * Debit transactions without a card or installment group do not own an
 * installment plan. Metadata edits such as changing the date must therefore
 * skip the installment-plan engine.
 */
export function hasInstallmentPlanForEdit(tx: TransactionEditSource): boolean {
  return Boolean(tx.card || tx.installment_group_id);
}

/** Returns the exact success feedback shown after editing a transaction. */
export function getTransactionEditSuccessMessage(result: InstallmentEditResult): string {
  if (result.cleared) return "Parcelamento removido";
  if (result.futureRowsAdded > 0) {
    const plural = result.futureRowsAdded > 1;
    return `Parcelamento salvo (${result.futureRowsAdded} parcela${plural ? "s" : ""} futura${plural ? "s" : ""} criada${plural ? "s" : ""})`;
  }
  return "Transação atualizada";
}
