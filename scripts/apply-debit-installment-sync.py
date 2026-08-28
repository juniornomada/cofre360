from pathlib import Path

path = Path("src/routes/transactions.tsx")
text = path.read_text()

old_import = 'import { validateEditedExpenseBalance } from "@/lib/transaction-balance-validation";\n'
new_import = old_import + 'import { inferDebitInstallmentContext } from "@/lib/debit-installment-history-sync";\n'
if "inferDebitInstallmentContext" not in text:
    if old_import not in text:
        raise SystemExit("balance validation import not found")
    text = text.replace(old_import, new_import, 1)

old_edit = '''  const handleEdit = (tx: Transaction) => {
    const baseAmount = tx.installment_mode === "divide" ? (tx.installment_source_amount ?? tx.amount) : tx.amount;
    const baseMode: "divide" | "fixed" = tx.installment_mode || "divide";
    const draft = loadEditDraft(tx.id);
    if (draft) {
      setEditTx({ ...tx, amount: baseAmount, ...draft.fields });
      setEditInstallmentMode(draft.mode ?? baseMode);
      toast.info("Rascunho da edição anterior restaurado");
    } else {
      setEditTx({ ...tx, amount: baseAmount });
      setEditInstallmentMode(baseMode);
    }
    setEditNameMode("none");
    setShowEditDialog(true);
  };'''

new_edit = '''  const handleEdit = (tx: Transaction) => {
    // Debit rows can originate from a purchase whose credit history still has
    // the authoritative installment context. Reuse only installment metadata;
    // never copy the credit group id or card to the debit transaction.
    const reusedInstallment = inferDebitInstallmentContext(tx, transactions);
    const installmentSeed = reusedInstallment
      ? {
          installment_number: reusedInstallment.installment_number,
          total_installments: reusedInstallment.total_installments,
          installment_mode: reusedInstallment.installment_mode,
          installment_source_amount: reusedInstallment.installment_source_amount,
        }
      : {};
    const effectiveTx = { ...tx, ...installmentSeed };
    const baseAmount = effectiveTx.installment_mode === "divide"
      ? (effectiveTx.installment_source_amount ?? effectiveTx.amount)
      : effectiveTx.amount;
    const baseMode: "divide" | "fixed" = effectiveTx.installment_mode || "divide";
    const draft = loadEditDraft(tx.id);
    if (draft) {
      setEditTx({ ...effectiveTx, amount: baseAmount, ...draft.fields, ...installmentSeed });
      setEditInstallmentMode(reusedInstallment?.installment_mode ?? draft.mode ?? baseMode);
      toast.info("Rascunho da edição anterior restaurado");
    } else {
      setEditTx({ ...effectiveTx, amount: baseAmount });
      setEditInstallmentMode(baseMode);
    }
    setEditNameMode("none");
    setShowEditDialog(true);
  };'''

if old_edit not in text:
    raise SystemExit("handleEdit block not found")
text = text.replace(old_edit, new_edit, 1)

old_update = '''        bank_account_id: editTx.bank_account_id || null,
        installment_mode: editInstallmentMode,
        installment_source_amount: editTx.amount,
      }).eq("id", editTx.id);'''
new_update = '''        bank_account_id: editTx.bank_account_id || null,
        // Preserve a reliable installment context inferred from credit history
        // without joining the debit row to the credit installment group.
        installment_number: total > 1 ? current : (editTx.installment_number ?? 1),
        total_installments: total,
        installment_mode: total > 1 ? editInstallmentMode : (editTx.installment_mode ?? null),
        installment_source_amount: total > 1 ? editTx.amount : (editTx.installment_source_amount ?? null),
      }).eq("id", editTx.id);'''
if old_update not in text:
    raise SystemExit("transaction update block not found")
text = text.replace(old_update, new_update, 1)

path.write_text(text)
