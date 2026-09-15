from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new))


# ---------------------------------------------------------------------------
# HOME: canonical server facts + data health + less cluttered header
# ---------------------------------------------------------------------------
home = "src/routes/home.tsx"
replace_once(
    home,
    'import { ThemeToggle } from "@/components/ThemeToggle";\n',
    'import { ThemeToggle } from "@/components/ThemeToggle";\nimport { FinancialDataHealth } from "@/components/FinancialDataHealth";\nimport { useFinancialMonthFacts } from "@/hooks/use-financial-month-facts";\nimport { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";\n',
)
replace_once(
    home,
    '  LogOut,\n  Plus,\n',
    '  LogOut,\n  Settings,\n  Plus,\n',
)
replace_once(
    home,
    '  const selectedMonthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;\n',
    '  const selectedMonthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;\n  const { data: canonicalFacts } = useFinancialMonthFacts(selectedMonthKey);\n',
)
replace_once(
    home,
    '}, [transactions, cards, selectedMonth, selectedMonthKey]);\n\n  const categorySpending = useMemo(() => {',
    '}, [transactions, cards, selectedMonth, selectedMonthKey]);\n  const displayedMonthly = canonicalFacts\n    ? { income: canonicalFacts.income, expense: canonicalFacts.expense }\n    : monthly;\n\n  const categorySpending = useMemo(() => {',
)
replace_once(
    home,
    '  }, [categoryLedgerTransactions, selectedMonth]);\n\n  const recent = useMemo(() => {',
    '  }, [categoryLedgerTransactions, selectedMonth]);\n  const displayedCategorySpending = canonicalFacts?.categories?.length\n    ? canonicalFacts.categories\n    : categorySpending;\n\n  const recent = useMemo(() => {',
)
replace_all(home, 'monthly.income', 'displayedMonthly.income')
replace_all(home, 'monthly.expense', 'displayedMonthly.expense')
replace_all(home, 'categorySpending.length', 'displayedCategorySpending.length')
replace_all(home, 'categorySpending.map', 'displayedCategorySpending.map')
replace_once(
    home,
    '''          <button onClick={handleLogout} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card" aria-label="Sair">
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
''',
    '',
)
replace_once(
    home,
    '          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"><ThemeToggle /></div>\n',
    '''          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card" aria-label="Configurações rápidas">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={(event) => event.preventDefault()} className="flex items-center justify-between gap-2 text-[12px]">
                <span>Tema</span><ThemeToggle />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleLogout} className="gap-2 text-[12px] text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
''',
)
replace_once(
    home,
    '      </section>\n\n      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-5">',
    '      </section>\n\n      <FinancialDataHealth monthKey={selectedMonthKey} />\n\n      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-5">',
)

# ---------------------------------------------------------------------------
# ORÇAMENTOS: same purchase-date economic category ledger as the rest of app
# ---------------------------------------------------------------------------
budget = "src/routes/orcametas.tsx"
replace_once(
    budget,
    'import { parseCategoryValue } from "@/lib/categories";\n',
    'import { parseCategoryValue } from "@/lib/categories";\nimport { collapseCategorySpendingRows } from "@/lib/category-spending";\nimport { inferTransactionKind } from "@/lib/financial-engine";\n',
)
replace_once(
    budget,
    '''interface TxRow {
  amount: number;
  category: string | null;
  type: string;
  date: string;
}
''',
    '''interface TxRow {
  id: string;
  amount: number;
  category: string | null;
  type: string;
  date: string;
  purchase_date?: string | null;
  created_at?: string | null;
  is_visible?: boolean | null;
  installment_group_id?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  installment_source_amount?: number | null;
  transaction_kind?: string | null;
}
''',
)
replace_once(
    budget,
    'supabase.from("transactions").select("amount, category, type, date").eq("type", "expense").neq("is_visible", false),',
    'supabase.from("transactions").select("id, amount, category, type, date, purchase_date, created_at, is_visible, installment_group_id, installment_number, total_installments, installment_source_amount, transaction_kind").eq("type", "expense").neq("is_visible", false),',
)
replace_once(
    budget,
    '      if (txs.data) setTransactions(txs.data as any);',
    '      if (txs.data) setTransactions(collapseCategorySpendingRows(txs.data as any) as TxRow[]);',
)
replace_once(
    budget,
    '    for (const tx of transactions) {\n      const d = parseTxDate(tx.date);',
    '    for (const tx of transactions) {\n      if (inferTransactionKind(tx as any) !== "expense") continue;\n      const d = parseTxDate(tx.date);',
)

# ---------------------------------------------------------------------------
# QUICK ADD: templates, impact preview, voice explanation, undo
# ---------------------------------------------------------------------------
quick = "src/components/QuickAddTransactionDialog.tsx"
replace_once(
    quick,
    'import { voiceAccountNamesMatch, type VoiceTransactionDraft } from "@/lib/voice-transaction";\n',
    'import { voiceAccountNamesMatch, type VoiceTransactionDraft } from "@/lib/voice-transaction";\nimport { TransactionTemplates, type TransactionTemplate } from "@/components/TransactionTemplates";\nimport { getBillingCycleMonthKey } from "@/lib/invoice-utils";\n',
)
replace_once(
    quick,
    'interface CardOption { name: string; brand: string; emoji: string | null; color: string | null }',
    'interface CardOption { id: string; name: string; brand: string; emoji: string | null; color: string | null; closing_day: number | null; due_day: number | null }',
)
replace_once(
    quick,
    'supabase.from("cards").select("name, brand, emoji, color").order("created_at", { ascending: true }),',
    'supabase.from("cards").select("id, name, brand, emoji, color, closing_day, due_day").order("created_at", { ascending: true }),',
)
replace_once(
    quick,
    'setCardOptions((cards || []).map(c => ({ name: c.name, brand: c.brand, emoji: c.emoji, color: c.color })));',
    'setCardOptions((cards || []).map(c => ({ id: c.id, name: c.name, brand: c.brand, emoji: c.emoji, color: c.color, closing_day: c.closing_day, due_day: c.due_day })));',
)
replace_once(
    quick,
    '  const isPartialLaunch = previewStart > 1;\n\n  const handleAdd = async () => {',
    '''  const isPartialLaunch = previewStart > 1;

  const selectedPreviewCard = cardOptions.find((card) => card.name === newTx.card);
  const impactInvoiceKey = selectedPreviewCard && newTx.date
    ? getBillingCycleMonthKey(newTx.date, new Date().toISOString(), selectedPreviewCard.closing_day)
    : null;
  const impactInvoiceLabel = impactInvoiceKey
    ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
        .format(new Date(`${impactInvoiceKey}-01T12:00:00`))
        .replace(" de ", " ")
    : null;
  const impactEconomicAmount = installmentEnabled && !isTransfer
    ? (installmentMode === "fixed" ? installmentDetails.totalCalculado : newTx.amount)
    : newTx.amount;
  const impactChargeAmount = installmentEnabled && !isTransfer
    ? installmentDetails.valorParcela
    : newTx.amount;

  const showUndoToast = (ids: string[], message: string) => {
    toast.success(message, {
      duration: 7000,
      action: ids.length ? {
        label: "Desfazer",
        onClick: async () => {
          const { error } = await supabase.from("transactions").delete().in("id", ids);
          if (error) {
            toast.error("Não foi possível desfazer o lançamento.");
            return;
          }
          onSuccess?.();
          toast.success("Lançamento desfeito");
        },
      } : undefined,
    });
  };

  const applyTemplate = (template: TransactionTemplate) => {
    const card = template.card_id ? cardOptions.find((item) => item.id === template.card_id) : null;
    setIsTransfer(false);
    setInstallmentEnabled(false);
    setInstallmentStart(1);
    setNewTx((previous) => ({
      ...previous,
      name: template.name,
      icon: template.icon || previous.icon,
      category: template.category,
      type: template.type === "income" ? "income" : "expense",
      amount: 0,
      bank_account_id: template.bank_account_id,
      card: card?.name || null,
    }));
  };

  const handleAdd = async () => {''',
)
replace_once(
    quick,
    '        toast.success("Transferência realizada com sucesso!");\n        return;',
    '        showUndoToast((data || []).map((row: any) => String(row.id)).filter(Boolean), "Transferência realizada com sucesso!");\n        return;',
)
replace_once(
    quick,
    '    if (installmentEnabled && cardValue && Number(installmentCount) > 1) {',
    '    let insertedIds: string[] = [];\n    if (installmentEnabled && cardValue && Number(installmentCount) > 1) {',
)
replace_once(
    quick,
    '       const { error } = await supabase.from("transactions").insert(sanitizeTransactionWrites(rows));\n       if (error) throw error;',
    '       const { error, data } = await supabase.from("transactions").insert(sanitizeTransactionWrites(rows)).select("id");\n       if (error) throw error;\n       insertedIds = (data || []).map((row: any) => String(row.id)).filter(Boolean);',
)
replace_once(
    quick,
    '       const { error } = await supabase.from("transactions").insert(sanitizeTransactionWrite({',
    '       const { error, data } = await supabase.from("transactions").insert(sanitizeTransactionWrite({',
)
replace_once(
    quick,
    '         is_visible: true\n       }));\n       if (error) throw error;',
    '         is_visible: true\n       })).select("id");\n       if (error) throw error;\n       insertedIds = (data || []).map((row: any) => String(row.id)).filter(Boolean);',
)
replace_once(
    quick,
    '    toast.success("Transação adicionada com sucesso!");',
    '    showUndoToast(insertedIds, "Transação adicionada com sucesso!");',
)
replace_once(
    quick,
    '        </DialogHeader>\n        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-2.5">',
    '''        </DialogHeader>
        <TransactionTemplates
          open={!isTransfer}
          current={{
            name: newTx.name,
            icon: newTx.icon,
            category: newTx.category,
            type: newTx.type,
            bank_account_id: newTx.bank_account_id,
            card_id: cardOptions.find((card) => card.name === newTx.card)?.id || null,
          }}
          onApply={applyTemplate}
        />
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-2.5">
          {initialDraft?.transcript && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-[11px] font-semibold text-primary">🎙 Entendi</p>
              <p className="mt-0.5 text-[12px] leading-snug text-foreground">“{initialDraft.transcript}”</p>
              <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <span className="rounded-full bg-background px-2 py-0.5">R$ {Number(initialDraft.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span className="rounded-full bg-background px-2 py-0.5">{initialDraft.category}</span>
                {initialDraft.card && <span className="rounded-full bg-background px-2 py-0.5">💳 {initialDraft.card}</span>}
                {initialDraft.bankAccount && <span className="rounded-full bg-background px-2 py-0.5">🏦 {initialDraft.bankAccount}</span>}
                {initialDraft.installmentCount && <span className="rounded-full bg-background px-2 py-0.5">{initialDraft.installmentCount}x</span>}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Confira os campos inferidos antes de salvar.</p>
            </div>
          )}''',
)
replace_once(
    quick,
    '        <DialogFooter className="shrink-0 border-t border-border/50 bg-background p-4 pt-3 flex-row gap-2 sm:gap-2">',
    '''        {!isTransfer && newTx.name && newTx.amount > 0 && (
          <div className="shrink-0 border-t border-border/40 bg-card/35 px-4 py-2">
            <p className="text-[11px] font-semibold text-foreground">Impacto deste lançamento</p>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              {newTx.card && impactInvoiceLabel && (
                <p>💳 {newTx.card} · fatura {impactInvoiceLabel} · {installmentEnabled ? `${previewStart}/${previewTotal} · ` : ""}<strong className="text-foreground">R$ {impactChargeAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></p>
              )}
              <p>{newTx.icon} {(newTx.category || "").split(">")[0].trim()} · {newTx.type === "income" ? "receita" : "gasto econômico"} <strong className="text-foreground">{newTx.type === "income" ? "+" : "+"} R$ {impactEconomicAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></p>
            </div>
          </div>
        )}
        <DialogFooter className="shrink-0 border-t border-border/50 bg-background p-4 pt-3 flex-row gap-2 sm:gap-2">''',
)
# Raise the smallest helper text without touching primary compact controls.
for old, new in [('text-[7px]', 'text-[9px]'), ('text-[8px]', 'text-[9px]')]:
    p = Path(quick); text = p.read_text(); p.write_text(text.replace(old, new))

# ---------------------------------------------------------------------------
# TRANSACTION ROW: swipe actions + duplicate
# ---------------------------------------------------------------------------
item = "src/components/TransactionItem.tsx"
replace_once(item, 'import { useEffect, useState } from "react";', 'import { useEffect, useRef, useState } from "react";')
replace_once(item, 'import { CreditCard, Landmark, ArrowLeftRight, Trash2 } from "lucide-react";', 'import { CreditCard, Landmark, ArrowLeftRight, Trash2, Pencil, Copy } from "lucide-react";')
replace_once(item, '  onDelete?: () => void;\n', '  onDelete?: () => void;\n  onDuplicate?: () => void;\n')
replace_once(
    item,
    '  installment_group_id, installment_number, total_installments, style, onEdit, onDelete, amountVisible = true\n}: TransactionItemProps) {',
    '  installment_group_id, installment_number, total_installments, style, onEdit, onDelete, onDuplicate, amountVisible = true\n}: TransactionItemProps) {',
)
replace_once(
    item,
    '  const [savingPurchaseDate, setSavingPurchaseDate] = useState(false);\n',
    '''  const [savingPurchaseDate, setSavingPurchaseDate] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [swipeActionsOpen, setSwipeActionsOpen] = useState(false);
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (delta < -42 && (onEdit || onDuplicate || onDelete)) setSwipeActionsOpen(true);
    if (delta > 35) setSwipeActionsOpen(false);
  };
''',
)
replace_once(
    item,
    '      onClick={onEdit}\n      className={cn(',
    '      onTouchStart={onTouchStart}\n      onTouchEnd={onTouchEnd}\n      onClick={() => { if (swipeActionsOpen) setSwipeActionsOpen(false); else onEdit?.(); }}\n      className={cn(',
)
replace_once(
    item,
    '      {onDelete && (\n        <div className="absolute right-2 sm:right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:opacity-0',
    '''      {swipeActionsOpen && (onEdit || onDuplicate || onDelete) && (
        <div className="absolute inset-y-0 right-0 z-20 flex items-center gap-1 rounded-r-xl border-l border-border bg-card/95 px-2 shadow-lg backdrop-blur sm:hidden" onClick={(event) => event.stopPropagation()}>
          {onEdit && <button type="button" onClick={() => { setSwipeActionsOpen(false); onEdit(); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-foreground" aria-label="Editar"><Pencil className="h-4 w-4" /></button>}
          {onDuplicate && <button type="button" onClick={() => { setSwipeActionsOpen(false); onDuplicate(); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary" aria-label="Duplicar"><Copy className="h-4 w-4" /></button>}
          {onDelete && <button type="button" onClick={() => { setSwipeActionsOpen(false); onDelete(); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>}
        </div>
      )}
      {onDelete && (
        <div className="hidden sm:flex absolute right-2 sm:right-2 top-1/2 -translate-y-1/2 items-center gap-1.5 sm:opacity-0''',
)

transactions = "src/routes/transactions.tsx"
replace_once(
    transactions,
    '                  onDelete={selectionMode ? undefined : () => { setDeleteTarget(tx); setDeleteScope("single"); setShowDeleteDialog(true); }}\n                  \n',
    '''                  onDelete={selectionMode ? undefined : () => { setDeleteTarget(tx); setDeleteScope("single"); setShowDeleteDialog(true); }}
                  onDuplicate={selectionMode ? undefined : () => {
                    setCopyTxData({
                      name: tx.name,
                      amount: Number(tx.amount),
                      category: tx.category,
                      icon: tx.icon,
                      card: tx.card ?? null,
                      bank_account_id: tx.bank_account_id ?? null,
                    });
                    setQuickAddType(tx.type === "income" ? "income" : "expense");
                    setShowAddDialog(true);
                  }}
                  
''',
)

print("audit improvements v1 applied")
