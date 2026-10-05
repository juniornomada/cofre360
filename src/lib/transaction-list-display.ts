export function getTransactionListDisplayAmounts(input: {
  economicAmount: number | string | null | undefined;
  originalAmount: number | string | null | undefined;
  installmentNumber: number | null | undefined;
  totalInstallments: number | null | undefined;
}) {
  const economicAmount = Number(input.economicAmount || 0);
  const originalAmount = Number(input.originalAmount || 0);
  const isInstallment =
    Number(input.totalInstallments || 0) > 1 &&
    Number(input.installmentNumber || 0) >= 1;

  if (
    isInstallment &&
    Number.isFinite(originalAmount) &&
    originalAmount > 0 &&
    Math.abs(originalAmount - economicAmount) >= 0.005
  ) {
    return {
      displayAmount: originalAmount,
      economicAmount,
    };
  }

  return {
    displayAmount: economicAmount,
    economicAmount: null,
  };
}
