from pathlib import Path

p = Path('src/routes/transactions.tsx')
text = p.read_text()

# 1) Negative balances must also remain allowed when editing an expense.
text = text.replace('import { validateEditedExpenseBalance } from "@/lib/transaction-balance-validation";\n', '')

# 2) Shared transfer detector.
needle = '''interface CardOption {
  name: string;
  brand: string;
  color?: string | null;
}

const iconOptions ='''
replacement = '''interface CardOption {
  name: string;
  brand: string;
  color?: string | null;
}

const isTransferTransaction = (tx: Pick<Transaction, "category"> | null | undefined) => {
  if (!tx) return false;
  const category = (tx.category || "").trim();
  return category === "Transferência" || category === "Transferências" || category.startsWith("Transferências >");
};

const iconOptions ='''
if needle not in text:
    raise SystemExit('card option insertion point not found')
text = text.replace(needle, replacement, 1)

# 3) Opening a transfer loads both ends of the linked pair into origin/destination selectors.
needle = '''  const handleEdit = (tx: Transaction) => {
    // Debit rows can originate from a purchase whose credit history still has'''
replacement = '''  const handleEdit = (tx: Transaction) => {
    if (isTransferTransaction(tx)) {
      const transferTx: Transaction = {
        ...tx,
        card: null,
        installment_number: null,
        total_installments: null,
        installment_mode: null,
        installment_source_amount: null,
      };
      setEditTx(transferTx);
      setEditInstallmentMode("divide");
      setEditNameMode("none");

      const groupId = tx.installment_group_id || null;
      const loadedPair = groupId
        ? transactions.filter(item => item.installment_group_id === groupId && isTransferTransaction(item))
        : [tx];
      const loadedFrom = loadedPair.find(item => item.type === "expense") || (tx.type === "expense" ? tx : undefined);
      const loadedTo = loadedPair.find(item => item.type === "income") || (tx.type === "income" ? tx : undefined);
      setTransferFromId(loadedFrom?.bank_account_id || "");
      setTransferToId(loadedTo?.bank_account_id || "");
      setShowEditDialog(true);

      if (groupId && (!loadedFrom || !loadedTo)) {
        void (async () => {
          const { data, error } = await supabase
            .from("transactions")
            .select("id,category,type,bank_account_id,installment_group_id")
            .eq("installment_group_id", groupId);
          if (error || !data) {
            if (error) console.error("Erro ao carregar par da transferência:", error);
            return;
          }
          const transferRows = data.filter(row => isTransferTransaction(row as Transaction));
          const from = transferRows.find(row => row.type === "expense");
          const to = transferRows.find(row => row.type === "income");
          if (from?.bank_account_id) setTransferFromId(from.bank_account_id);
          if (to?.bank_account_id) setTransferToId(to.bank_account_id);
        })();
      }
      return;
    }

    // Debit rows can originate from a purchase whose credit history still has'''
if needle not in text:
    raise SystemExit('handleEdit insertion point not found')
text = text.replace(needle, replacement, 1)

# 4) Special save path: update the expense + income rows as one logical transfer.
needle = '''   const handleSaveEdit = async () => {
     if (!editTx) return;

     const isCreditExpense ='''
replacement = '''   const handleSaveEdit = async () => {
     if (!editTx) return;

     if (isTransferTransaction(editTx)) {
       if (!editTx.installment_group_id) {
         toast.error("Esta transferência antiga não possui vínculo entre origem e destino.");
         return;
       }
       if (!transferFromId || !transferToId || transferFromId === transferToId) {
         toast.error("Selecione contas diferentes para origem e destino.");
         return;
       }
       const transferAmount = Number(editTx.amount);
       if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
         toast.error("Informe um valor maior que zero.");
         return;
       }

       let savedSuccessfully = false;
       try {
         const { data: pairRows, error: pairError } = await supabase
           .from("transactions")
           .select("id,icon,name,category,date,amount,type,card,bank_account_id,installment_group_id")
           .eq("installment_group_id", editTx.installment_group_id);
         if (pairError) throw pairError;

         const transferRows = (pairRows || []).filter(row => isTransferTransaction(row as Transaction));
         const fromRow = transferRows.find(row => row.type === "expense");
         const toRow = transferRows.find(row => row.type === "income");
         if (!fromRow || !toRow) {
           toast.error("Não foi possível localizar as duas pontas desta transferência.");
           return;
         }

         const fromAccount = bankAccounts.find(account => account.id === transferFromId);
         const toAccount = bankAccounts.find(account => account.id === transferToId);
         if (!fromAccount || !toAccount) {
           toast.error("Selecione contas válidas para a transferência.");
           return;
         }

         const shared = {
           icon: "🔄",
           category: "Transferências > Outros",
           date: editTx.date,
           amount: transferAmount,
           card: null,
         };

         const { error: fromError } = await supabase
           .from("transactions")
           .update({
             ...shared,
             name: `Transferência → ${toAccount.name}`,
             type: "expense",
             bank_account_id: transferFromId,
           })
           .eq("id", fromRow.id);
         if (fromError) throw fromError;

         const { error: toError } = await supabase
           .from("transactions")
           .update({
             ...shared,
             name: `Transferência ← ${fromAccount.name}`,
             type: "income",
             bank_account_id: transferToId,
           })
           .eq("id", toRow.id);

         if (toError) {
           // Best-effort rollback so a failed second update does not leave a half-edited transfer.
           await supabase
             .from("transactions")
             .update({
               icon: fromRow.icon,
               name: fromRow.name,
               category: fromRow.category,
               date: fromRow.date,
               amount: fromRow.amount,
               type: fromRow.type,
               card: fromRow.card,
               bank_account_id: fromRow.bank_account_id,
             })
             .eq("id", fromRow.id);
           throw toError;
         }

         clearEditDraft(fromRow.id);
         clearEditDraft(toRow.id);
         toast.success("Transferência atualizada");
         savedSuccessfully = true;
       } catch (error) {
         console.error("Erro ao atualizar transferência:", error);
         toast.error("Erro ao atualizar transferência");
       } finally {
         (document.activeElement as HTMLElement)?.blur();
         if (savedSuccessfully) {
           setShowEditDialog(false);
           setEditTx(null);
           setTransferFromId("");
           setTransferToId("");
           await Promise.all([fetchTransactions(), fetchBankAccounts()]);
           if (shouldReturnHome) {
             window.location.assign("/home");
           }
         }
       }
       return;
     }

     const isCreditExpense ='''
if needle not in text:
    raise SystemExit('handleSaveEdit insertion point not found')
text = text.replace(needle, replacement, 1)

# 5) Remove the remaining insufficient-balance validation from standard edit.
start = text.find('''      // Balance check for expenses from bank accounts\n''')
end_marker = '''      // 1) Update fields on the current row (amount = per-installment when split)\n'''
if start < 0:
    raise SystemExit('edit balance check start not found')
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit('edit balance check end not found')
text = text[:start] + '''      // Expenses may intentionally leave the selected account with a negative balance.\n\n''' + text[end:]

# 6) Header: transfers cannot be converted accidentally into income/expense.
needle = '''              {editTx && (
                <div className="flex min-w-0 flex-1 gap-1">
                  <button'''
replacement = '''              {editTx && (
                isTransferTransaction(editTx) ? (
                  <div className="flex min-w-0 flex-1 items-center justify-center rounded-lg bg-blue-500/15 py-1 text-[10px] font-semibold text-blue-500">
                    <ArrowLeftRight className="mr-1 h-3 w-3" />
                    Transferência
                  </div>
                ) : (
                <div className="flex min-w-0 flex-1 gap-1">
                  <button'''
if needle not in text:
    raise SystemExit('edit header start not found')
text = text.replace(needle, replacement, 1)
needle = '''                </div>
              )}
            </div>
          </DialogHeader>'''
replacement = '''                </div>
                )
              )}
            </div>
          </DialogHeader>'''
if needle not in text:
    raise SystemExit('edit header end not found')
text = text.replace(needle, replacement, 1)

# 7) Hide name and category for transfer edits; those labels are derived from origin/destination.
needle = '''              <div className="relative min-w-0">
                <label className="mb-0.5 block text-[11px] font-semibold text-foreground">Nome</label>'''
replacement = '''              {!isTransferTransaction(editTx) && (
              <div className="relative min-w-0">
                <label className="mb-0.5 block text-[11px] font-semibold text-foreground">Nome</label>'''
if needle not in text:
    raise SystemExit('edit name start not found')
text = text.replace(needle, replacement, 1)
needle = '''              </div>

              <Suspense fallback={<div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>'''
replacement = '''              </div>
              )}

              {!isTransferTransaction(editTx) && (
              <Suspense fallback={<div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>'''
if needle not in text:
    raise SystemExit('edit category start not found')
text = text.replace(needle, replacement, 1)
needle = '''              </Suspense>

              <div className="grid grid-cols-2 gap-2">'''
replacement = '''              </Suspense>
              )}

              <div className="grid grid-cols-2 gap-2">'''
if needle not in text:
    raise SystemExit('edit category end not found')
text = text.replace(needle, replacement, 1)

# Transfer gets its own calculator tone.
text = text.replace('''                    tone={editTx.type}
''', '''                    tone={isTransferTransaction(editTx) ? "transfer" : editTx.type}
''', 1)

# 8) Add origin/destination account selectors before the regular debit selector.
needle = '''              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-foreground">
                  <Landmark className="h-3 w-3" />
                  Conta Débito/Pix
                </label>'''
transfer_ui = '''              {isTransferTransaction(editTx) && (
                <div className="rounded-xl bg-card/50 p-2.5 space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-foreground">De (origem)</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {bankAccounts.map((a) => (
                        <button
                          key={`from-${a.id}`}
                          type="button"
                          aria-pressed={transferFromId === a.id}
                          onClick={() => setTransferFromId(a.id)}
                          className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                            transferFromId === a.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                          }`}
                        >
                          <BankLogo icon={a.icon || "custom"} color={a.color || "from-gray-500 to-gray-700"} name={a.name} size="sm" />
                          <span className="w-full truncate text-center text-[9px] leading-tight text-foreground">{a.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-foreground">Para (destino)</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {bankAccounts.filter(a => a.id !== transferFromId).map((a) => (
                        <button
                          key={`to-${a.id}`}
                          type="button"
                          aria-pressed={transferToId === a.id}
                          onClick={() => setTransferToId(a.id)}
                          className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                            transferToId === a.id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                          }`}
                        >
                          <BankLogo icon={a.icon || "custom"} color={a.color || "from-gray-500 to-gray-700"} name={a.name} size="sm" />
                          <span className="w-full truncate text-center text-[9px] leading-tight text-foreground">{a.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isTransferTransaction(editTx) && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-foreground">
                  <Landmark className="h-3 w-3" />
                  Conta Débito/Pix
                </label>'''
if needle not in text:
    raise SystemExit('debit selector start not found')
text = text.replace(needle, transfer_ui, 1)

# Close regular debit selector condition before card selector, then wrap card selector too.
needle = '''              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-foreground">
                  <CreditCard className="h-3 w-3" />'''
replacement = '''              </div>
              )}

              {!isTransferTransaction(editTx) && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-foreground">
                  <CreditCard className="h-3 w-3" />'''
if needle not in text:
    raise SystemExit('card selector start not found')
text = text.replace(needle, replacement, 1)

needle = '''              </div>

              {/* Parcelamento — apenas para despesas no cartão de crédito */}'''
replacement = '''              </div>
              )}

              {/* Parcelamento — apenas para despesas no cartão de crédito */}'''
if needle not in text:
    raise SystemExit('card selector end not found')
text = text.replace(needle, replacement, 1)

p.write_text(text)
print('transfer edit patch applied')
