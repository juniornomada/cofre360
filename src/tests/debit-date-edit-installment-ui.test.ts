import { describe, expect, it } from "vitest";
import { inferDebitInstallmentContext, type InstallmentHistoryTransaction } from "@/lib/debit-installment-history-sync";
import {
  getTransactionEditSuccessMessage,
  hasInstallmentPlanForEdit,
  type InstallmentEditResult,
} from "@/lib/transaction-edit-feedback";

const successfulMetadataEdit: InstallmentEditResult = {
  cleared: false,
  futureRowsAdded: 0,
};

describe("debit expense date edit feedback", () => {
  it("allows moving a debit expense to an earlier day without indicating installment removal", () => {
    const original = {
      date: "2026-08-28",
      card: null,
      installment_group_id: null,
    };
    const edited = { ...original, date: "2026-08-20" };

    expect(new Date(edited.date).getTime()).toBeLessThan(new Date(original.date).getTime());
    expect(hasInstallmentPlanForEdit(edited)).toBe(false);

    const message = getTransactionEditSuccessMessage(successfulMetadataEdit);
    expect(message).toBe("Transação atualizada");
    expect(message).not.toBe("Parcelamento removido");
  });

  it("keeps the UI free of removal feedback when an earlier debit date reuses credit installment history", () => {
    const debit: InstallmentHistoryTransaction = {
      id: "debit-1",
      name: "Notebook",
      category: "Compras > Eletrônicos",
      date: "2026-08-28",
      amount: 500,
      type: "expense",
      card: null,
      bank_account_id: "bank-1",
      installment_group_id: null,
      installment_number: 1,
      total_installments: 1,
    };

    const creditHistory: InstallmentHistoryTransaction[] = [
      {
        id: "credit-1",
        name: "Notebook (1/4)",
        category: "Compras > Eletrônicos",
        date: "2026-07-28",
        amount: 500,
        type: "expense",
        card: "Nubank",
        bank_account_id: null,
        installment_group_id: "credit-group-1",
        installment_number: 1,
        total_installments: 4,
        installment_mode: "divide",
        installment_source_amount: 2000,
      },
      {
        id: "credit-2",
        name: "Notebook (2/4)",
        category: "Compras > Eletrônicos",
        date: "2026-08-28",
        amount: 500,
        type: "expense",
        card: "Nubank",
        bank_account_id: null,
        installment_group_id: "credit-group-1",
        installment_number: 2,
        total_installments: 4,
        installment_mode: "divide",
        installment_source_amount: 2000,
      },
    ];

    const inferred = inferDebitInstallmentContext(debit, creditHistory);
    expect(inferred).not.toBeNull();

    // Simulates the user changing only the debit date to a previous day. The
    // inferred metadata is reused, but card/group ownership remains debit.
    const editedDebit = {
      ...debit,
      date: "2026-08-10",
      installment_number: inferred!.installment_number,
      total_installments: inferred!.total_installments,
      installment_mode: inferred!.installment_mode,
      installment_source_amount: inferred!.installment_source_amount,
    };

    expect(new Date(editedDebit.date).getTime()).toBeLessThan(new Date(debit.date).getTime());
    expect(editedDebit.card).toBeNull();
    expect(editedDebit.installment_group_id).toBeNull();
    expect(hasInstallmentPlanForEdit(editedDebit)).toBe(false);

    const message = getTransactionEditSuccessMessage(successfulMetadataEdit);
    expect(message).toBe("Transação atualizada");
    expect(message).not.toContain("Parcelamento removido");
  });
});
