from pathlib import Path

path = Path('src/routes/transactions.tsx')
text = path.read_text()

old_account = '''                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, bank_account_id: null })}
                    className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                      !editTx.bank_account_id ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                    }`}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">—</div>
                    <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground">Nenhuma</span>
                  </button>
                  {bankAccounts.map((a) => ('''
new_account = '''                <div className="grid grid-cols-5 gap-1.5">
                  {bankAccounts.map((a) => ('''
if old_account not in text:
    raise SystemExit('account none block not found')
text = text.replace(old_account, new_account, 1)

old_card = '''                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, card: null })}
                    className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all ${
                      !editTx.card ? "bg-primary/15 ring-1 ring-primary" : "bg-card hover:bg-accent"
                    }`}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">—</div>
                    <span className="w-full truncate text-center text-[9px] leading-tight text-muted-foreground">Nenhum</span>
                  </button>
                  {cardOptions.filter(c => c.name !== "Nenhum").map((c) => {'''
new_card = '''                <div className="grid grid-cols-5 gap-1.5">
                  {cardOptions.filter(c => c.name !== "Nenhum").map((c) => {'''
if old_card not in text:
    raise SystemExit('card none block not found')
text = text.replace(old_card, new_card, 1)

old_validation = '''     const isCreditExpense = editTx.type === "expense" && editTx.bank_account_id === null;
     const hasValidCard = !!editTx.card && editTx.card !== "Nenhum";
     if (isCreditExpense && !hasValidCard) {
       toast.error("Selecione o cartão de crédito antes de salvar a transação.");
       return;
     }'''
new_validation = '''     const hasSelectedPaymentSource =
       !!editTx.bank_account_id || (!!editTx.card && editTx.card !== "Nenhum");
     if (!hasSelectedPaymentSource) {
       toast.error("Selecione uma conta ou um cartão antes de salvar a transação.");
       return;
     }'''
if old_validation not in text:
    raise SystemExit('save validation block not found')
text = text.replace(old_validation, new_validation, 1)

old_disabled = '''              disabled={!!editTx && editTx.type === "expense" && (
                (editTx.bank_account_id === null && (!editTx.card || editTx.card === "Nenhum")) ||
                (editTx.card === null && !editTx.bank_account_id)
              )}'''
new_disabled = '''              disabled={!!editTx && !isTransferTransaction(editTx) &&
                !editTx.bank_account_id && (!editTx.card || editTx.card === "Nenhum")
              }'''
if old_disabled not in text:
    raise SystemExit('save button disabled block not found')
text = text.replace(old_disabled, new_disabled, 1)

# Add a small guidance line under cards, matching Quick Add behavior.
needle = '''                </div>
              </div>
              )}

              {/* Parcelamento — apenas para despesas no cartão de crédito */}'''
replacement = '''                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">Selecione uma conta ou um cartão. Toque novamente no selecionado para desmarcar.</p>
              </div>
              )}

              {/* Parcelamento — apenas para despesas no cartão de crédito */}'''
if needle not in text:
    raise SystemExit('guidance insertion point not found')
text = text.replace(needle, replacement, 1)

path.write_text(text)
