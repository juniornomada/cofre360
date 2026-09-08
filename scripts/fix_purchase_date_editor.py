from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"anchor not found: {label} in {path}")
    p.write_text(s.replace(old, new, 1))


# Cards invoice editor: edit purchase_date, never the installment date.
replace_once(
    "src/routes/cards.tsx",
    '''              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl bg-accent/30 border-none h-10", !editTx.date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editTx.date}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={(() => {
                        try {
                          return parse(editTx.date, "dd MMM", new Date(), { locale: ptBR });
                        } catch { return undefined; }
                      })()}
                      onSelect={(date) => {
                        if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) });
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>''',
    '''              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Data da compra</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl bg-accent/30 border-none h-10", !editTx.purchase_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatPurchaseDateBr(editTx.purchase_date) || "Definir data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editTx.purchase_date
                        ? parseTxDate(editTx.purchase_date, editTx.created_at || new Date().toISOString())
                        : undefined}
                      onSelect={(date) => {
                        if (date) setEditTx({ ...editTx, purchase_date: format(date, "yyyy-MM-dd") });
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="mt-1 text-[9px] text-muted-foreground">A parcela permanece na fatura original.</p>
              </div>''',
    "cards editor date field",
)

replace_once(
    "src/routes/cards.tsx",
    '''      const sharedUpdate = {
        name: baseName,
        category: editTx.category,
        icon: editTx.icon,
        amount: editTx.amount,
      };''',
    '''      const sharedUpdate = {
        name: baseName,
        category: editTx.category,
        icon: editTx.icon,
        amount: editTx.amount,
        purchase_date: editTx.purchase_date || null,
      };''',
    "cards shared update",
)

replace_once(
    "src/routes/cards.tsx",
    '''      setEditScopeDialogOpen(false);
      setShowEditDialog(false);
      setEditOriginalTx(null);''',
    '''      const purchaseDateGroupId = editOriginalTx.installment_group_id || editTx.installment_group_id;
      if (
        purchaseDateGroupId &&
        (editOriginalTx.purchase_date || null) !== (editTx.purchase_date || null)
      ) {
        const { error: purchaseDateError } = await supabase
          .from("transactions")
          .update({ purchase_date: editTx.purchase_date || null })
          .eq("installment_group_id", purchaseDateGroupId);
        if (purchaseDateError) throw purchaseDateError;
      }

      setEditScopeDialogOpen(false);
      setShowEditDialog(false);
      setEditOriginalTx(null);''',
    "cards purchase date group propagation",
)

replace_once(
    "src/routes/cards.tsx",
    '''    const originalCurrent = Math.max(1, Number(editOriginalTx.installment_number) || 1);
    const originalTotal = Math.max(1, Number(editOriginalTx.total_installments) || 1);
    const hasFutureImpact =''',
    '''    const originalCurrent = Math.max(1, Number(editOriginalTx.installment_number) || 1);
    const originalTotal = Math.max(1, Number(editOriginalTx.total_installments) || 1);
    const onlyPurchaseDateChanged =
      (editOriginalTx.purchase_date || null) !== (editTx.purchase_date || null) &&
      stripInstallmentSuffix(editOriginalTx.name) === stripInstallmentSuffix(editTx.name) &&
      (editOriginalTx.category || "") === (editTx.category || "") &&
      (editOriginalTx.icon || "") === (editTx.icon || "") &&
      Number(editOriginalTx.amount) === Number(editTx.amount) &&
      editOriginalTx.date === editTx.date &&
      requestedCurrent === originalCurrent &&
      requestedTotal === originalTotal;

    if (onlyPurchaseDateChanged) {
      await performSaveEditTx("single");
      return;
    }

    const hasFutureImpact =''',
    "cards purchase-only save",
)

# Transactions page: same semantics for card transactions.
replace_once(
    "src/routes/transactions.tsx",
    '''  date: string;
  amount: number;''',
    '''  date: string;
  purchase_date?: string | null;
  amount: number;''',
    "transaction type purchase_date",
)

replace_once(
    "src/routes/transactions.tsx",
    '''          .select("id,icon,name,category,date,amount,type,card,bank_account_id,created_at,installment_group_id,installment_number,total_installments,installment_mode,installment_source_amount,is_visible")''',
    '''          .select("id,icon,name,category,date,purchase_date,amount,type,card,bank_account_id,created_at,installment_group_id,installment_number,total_installments,installment_mode,installment_source_amount,is_visible")''',
    "direct edit purchase_date select",
)

replace_once(
    "src/routes/transactions.tsx",
    '''          date: editTx.date,
          type: editTx.type,''',
    '''          date: editTx.date,
          purchase_date: editTx.purchase_date ?? null,
          type: editTx.type,''',
    "draft purchase_date",
)

replace_once(
    "src/routes/transactions.tsx",
    '''                  <label className="mb-0.5 block text-[11px] font-semibold text-foreground">Data</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-8 w-full justify-start rounded-lg border-none bg-card px-2.5 text-left text-xs font-normal",
                          !editTx.date && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {editTx.date ? formatEditorTxDate(editTx.date, editTx.created_at) : "Data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="z-[60] w-auto p-0" align="start" sideOffset={4}>
                      <Calendar
                        mode="single"
                        selected={parseEditorTxDate(editTx.date, editTx.created_at)}
                        onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd-MM-yyyy") }); }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>''',
    '''                  <label className="mb-0.5 block text-[11px] font-semibold text-foreground">
                    {editTx.card && editTx.card !== "Nenhum" ? "Data da compra" : "Data"}
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-8 w-full justify-start rounded-lg border-none bg-card px-2.5 text-left text-xs font-normal",
                          !(editTx.card && editTx.card !== "Nenhum" ? editTx.purchase_date : editTx.date) && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {editTx.card && editTx.card !== "Nenhum"
                          ? (editTx.purchase_date ? formatEditorTxDate(editTx.purchase_date, editTx.created_at) : "Definir data")
                          : (editTx.date ? formatEditorTxDate(editTx.date, editTx.created_at) : "Data")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="z-[60] w-auto p-0" align="start" sideOffset={4}>
                      <Calendar
                        mode="single"
                        selected={parseEditorTxDate(
                          (editTx.card && editTx.card !== "Nenhum" ? editTx.purchase_date : editTx.date) || "",
                          editTx.created_at,
                        )}
                        onSelect={(date) => {
                          if (!date) return;
                          if (editTx.card && editTx.card !== "Nenhum") {
                            setEditTx({ ...editTx, purchase_date: format(date, "yyyy-MM-dd") });
                          } else {
                            setEditTx({ ...editTx, date: format(date, "dd-MM-yyyy") });
                          }
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {editTx.card && editTx.card !== "Nenhum" && (
                    <p className="mt-1 text-[9px] leading-tight text-muted-foreground">A parcela permanece na fatura original.</p>
                  )}''',
    "transactions editor date field",
)

replace_once(
    "src/routes/transactions.tsx",
    '''        category: editTx.category,
        date: editTx.date,
        amount: perInstallment,''',
    '''        category: editTx.category,
        date: editTx.date,
        ...(editTx.card && editTx.card !== "Nenhum" ? { purchase_date: editTx.purchase_date ?? null } : {}),
        amount: perInstallment,''',
    "transactions save purchase_date",
)

replace_once(
    "src/routes/transactions.tsx",
    '''      if (result.cleared) {''',
    '''      if (editTx.card && editTx.card !== "Nenhum" && editTx.installment_group_id) {
        const originalTx = transactions.find(t => t.id === editTx.id);
        if ((originalTx?.purchase_date || null) !== (editTx.purchase_date || null)) {
          const { error: purchaseDateError } = await supabase
            .from("transactions")
            .update({ purchase_date: editTx.purchase_date ?? null })
            .eq("installment_group_id", editTx.installment_group_id);
          if (purchaseDateError) throw purchaseDateError;
        }
      }

      if (result.cleared) {''',
    "transactions group purchase_date propagation",
)

replace_once(
    "src/lib/edit-transaction-draft.ts",
    '''  date?: string;
  type?: "income" | "expense";''',
    '''  date?: string;
  purchase_date?: string | null;
  type?: "income" | "expense";''',
    "draft schema purchase_date",
)

print("purchase-date editor patch applied")
