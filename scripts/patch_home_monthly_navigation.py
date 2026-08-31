from pathlib import Path

p = Path("src/routes/home.tsx")
s = p.read_text()

repls = []

repls.append((
'''  CreditCard,\n  Eye,''',
'''  CreditCard,\n  ChevronLeft,\n  ChevronRight,\n  Eye,'''
))

repls.append((
'''  const [reminders, setReminders] = useState<Reminder[]>([]);\n  const [loading, setLoading] = useState(true);''',
'''  const [reminders, setReminders] = useState<Reminder[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {\n    const now = new Date();\n    return new Date(now.getFullYear(), now.getMonth(), 1);\n  });'''
))

old_calc = '''        const rawAccounts = (accountsRes.data || []) as Account[];\n        const rawTx = (txRes.data || []) as Tx[];\n        const incomeByAccount: Record<string, number> = {};\n        const expenseByAccount: Record<string, number> = {};\n        const today = new Date();\n        today.setHours(23, 59, 59, 999);\n\n        for (const tx of rawTx) {\n          if (tx.is_visible === false || !tx.bank_account_id) continue;\n          if (tx.type === "expense" && tx.card) continue;\n          const transactionDate = safeDate(tx.date, tx.created_at);\n          if (transactionDate && transactionDate > today) continue;\n          const amount = Number(tx.amount || 0);\n          if (tx.type === "income") incomeByAccount[tx.bank_account_id] = (incomeByAccount[tx.bank_account_id] || 0) + amount;\n          else expenseByAccount[tx.bank_account_id] = (expenseByAccount[tx.bank_account_id] || 0) + amount;\n        }\n\n        const calculated = rawAccounts.map((account) => ({\n          ...account,\n          balance: Math.round((Number(account.balance || 0) + (incomeByAccount[account.id] || 0) - (expenseByAccount[account.id] || 0)) * 100) / 100,\n        }));\n\n        if (!cancelled) {\n          setAccounts(calculated);'''
new_calc = '''        const rawAccounts = (accountsRes.data || []) as Account[];\n        const rawTx = (txRes.data || []) as Tx[];\n\n        if (!cancelled) {\n          // Keep the opening balance untouched. Monthly balances are derived below\n          // from the selected month so Home can navigate historically.\n          setAccounts(rawAccounts);'''
repls.append((old_calc, new_calc))

old_visible = '''  const visibleAccounts = useMemo(\n    () => accounts.filter((account) => account.is_visible !== false),\n    [accounts],\n  );'''
new_visible = '''  const selectedMonthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;\n  const selectedMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })\n    .format(selectedMonth)\n    .replace(/^./, (c) => c.toUpperCase());\n  const now = new Date();\n  const isCurrentSelectedMonth = now.getFullYear() === selectedMonth.getFullYear() && now.getMonth() === selectedMonth.getMonth();\n  const isFutureSelectedMonth = selectedMonth.getFullYear() > now.getFullYear() ||\n    (selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() > now.getMonth());\n  const selectedCutoff = useMemo(() => {\n    if (isCurrentSelectedMonth) {\n      const today = new Date();\n      today.setHours(23, 59, 59, 999);\n      return today;\n    }\n    return new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999);\n  }, [selectedMonth, isCurrentSelectedMonth]);\n\n  const shiftSelectedMonth = (delta: number) => {\n    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));\n  };\n\n  const displayAccounts = useMemo(() => {\n    const incomeByAccount: Record<string, number> = {};\n    const expenseByAccount: Record<string, number> = {};\n\n    for (const tx of transactions) {\n      if (tx.is_visible === false || !tx.bank_account_id) continue;\n      if (tx.type === "expense" && tx.card) continue;\n      const transactionDate = safeDate(tx.date, tx.created_at);\n      if (transactionDate && transactionDate > selectedCutoff) continue;\n      const amount = Number(tx.amount || 0);\n      if (tx.type === "income") incomeByAccount[tx.bank_account_id] = (incomeByAccount[tx.bank_account_id] || 0) + amount;\n      else expenseByAccount[tx.bank_account_id] = (expenseByAccount[tx.bank_account_id] || 0) + amount;\n    }\n\n    return accounts.map((account) => ({\n      ...account,\n      balance: Math.round((Number(account.balance || 0) + (incomeByAccount[account.id] || 0) - (expenseByAccount[account.id] || 0)) * 100) / 100,\n    }));\n  }, [accounts, transactions, selectedCutoff]);\n\n  const visibleAccounts = useMemo(\n    () => displayAccounts.filter((account) => account.is_visible !== false),\n    [displayAccounts],\n  );'''
repls.append((old_visible, new_visible))

old_monthly = '''  const monthly = useMemo(() => {\n    const now = new Date();\n    let income = 0;\n    let expense = 0;\n    for (const tx of transactions) {\n      if (tx.is_visible === false) continue;\n      const d = safeDate(tx.date, tx.created_at);\n      if (!d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;\n      if (tx.type === "income") income += Number(tx.amount || 0);\n      else expense += Number(tx.amount || 0);\n    }\n    return { income, expense };\n  }, [transactions]);\n\n  const recent = useMemo(() => {\n    const today = new Date();\n    today.setHours(23, 59, 59, 999);\n    return transactions\n      .filter((tx) => {\n        if (tx.is_visible === false) return false;\n        const transactionDate = safeDate(tx.date, tx.created_at);\n        return !transactionDate || transactionDate <= today;\n      })\n      .slice(0, 8);\n  }, [transactions]);\n\n  const cardTotals = useMemo(() => {\n    const result: Record<string, number> = {};\n    for (const card of cards) result[card.name] = 0;\n    for (const tx of transactions) {\n      if (tx.is_visible === false || !tx.card) continue;\n      const amount = Number(tx.amount || 0);\n      result[tx.card] = (result[tx.card] || 0) + (tx.type === "income" ? -amount : amount);\n    }\n    return result;\n  }, [cards, transactions]);'''
new_monthly = '''  const selectedMonthTransactions = useMemo(() => {\n    return transactions.filter((tx) => {\n      if (tx.is_visible === false) return false;\n      const d = safeDate(tx.date, tx.created_at);\n      if (!d) return false;\n      return d.getFullYear() === selectedMonth.getFullYear() && d.getMonth() === selectedMonth.getMonth();\n    });\n  }, [transactions, selectedMonth]);\n\n  const monthly = useMemo(() => {\n    let income = 0;\n    let expense = 0;\n    for (const tx of selectedMonthTransactions) {\n      if (tx.type === "income") income += Number(tx.amount || 0);\n      else expense += Number(tx.amount || 0);\n    }\n    return { income, expense };\n  }, [selectedMonthTransactions]);\n\n  const recent = useMemo(() => {\n    return [...selectedMonthTransactions]\n      .filter((tx) => {\n        const d = safeDate(tx.date, tx.created_at);\n        return !isCurrentSelectedMonth || !d || d <= selectedCutoff;\n      })\n      .sort((a, b) => {\n        const da = safeDate(a.date, a.created_at)?.getTime() ?? 0;\n        const db = safeDate(b.date, b.created_at)?.getTime() ?? 0;\n        if (db !== da) return db - da;\n        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();\n      })\n      .slice(0, 8);\n  }, [selectedMonthTransactions, isCurrentSelectedMonth, selectedCutoff]);\n\n  const cardTotals = useMemo(() => {\n    const result: Record<string, number> = {};\n    for (const card of cards) result[card.name] = 0;\n    for (const tx of selectedMonthTransactions) {\n      if (!tx.card) continue;\n      const amount = Number(tx.amount || 0);\n      result[tx.card] = (result[tx.card] || 0) + (tx.type === "income" ? -amount : amount);\n    }\n    return result;\n  }, [cards, selectedMonthTransactions]);'''
repls.append((old_monthly, new_monthly))

header_end = '''      </div>\n\n      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-5">'''
header_new = '''      </div>\n\n      <section className="flex items-center justify-between rounded-2xl border border-border/50 bg-card px-2 py-2">\n        <button\n          type="button"\n          onClick={() => shiftSelectedMonth(-1)}\n          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"\n          aria-label="Mês anterior"\n          title="Mês anterior"\n        >\n          <ChevronLeft className="h-5 w-5" />\n        </button>\n        <div className="min-w-0 text-center">\n          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Visão mensal</p>\n          <p className="truncate text-sm font-bold text-foreground">{selectedMonthLabel}</p>\n          <p className="text-[10px] text-muted-foreground">{isCurrentSelectedMonth ? "Até hoje" : isFutureSelectedMonth ? "Previsto até o fim do mês" : "Fechamento do mês"}</p>\n        </div>\n        <button\n          type="button"\n          onClick={() => shiftSelectedMonth(1)}\n          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"\n          aria-label="Próximo mês"\n          title="Próximo mês"\n        >\n          <ChevronRight className="h-5 w-5" />\n        </button>\n      </section>\n\n      <section className="rounded-2xl border border-border/40 bg-gradient-to-br from-primary/15 via-card to-card p-5">'''
repls.append((header_end, header_new))

# Keep the selected month when drilling into transaction lists.
repls.append((
'''search={{ accountId: account.id } as any}''',
'''search={{ accountId: account.id, month: selectedMonthKey } as any}'''
))
repls.append((
'''search={{ accountId: subaccount.id } as any}''',
'''search={{ accountId: subaccount.id, month: selectedMonthKey } as any}'''
))

repls.append((
'''<Link to="/transactions" className="text-[10px] font-semibold text-primary">Ver todas</Link>''',
'''<Link to="/transactions" search={{ month: selectedMonthKey } as any} className="text-[10px] font-semibold text-primary">Ver todas</Link>'''
))

repls.append((
'''<Link key={tx.id} to="/transactions" className="flex items-center gap-3 rounded-xl border border-border/20 bg-card px-3 py-2.5">''',
'''<Link key={tx.id} to="/transactions" search={{ month: selectedMonthKey } as any} className="flex items-center gap-3 rounded-xl border border-border/20 bg-card px-3 py-2.5">'''
))

repls.append((
'''<div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5 text-primary" />Receitas do mês</div>''',
'''<div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5 text-primary" />Receitas · {selectedMonthLabel.split(" ")[0]}</div>'''
))
repls.append((
'''<div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowDownRight className="h-3.5 w-3.5 text-destructive" />Despesas do mês</div>''',
'''<div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground"><ArrowDownRight className="h-3.5 w-3.5 text-destructive" />Despesas · {selectedMonthLabel.split(" ")[0]}</div>'''
))
repls.append((
'''<h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ArrowLeftRight className="h-4 w-4 text-primary" />Transações recentes</h2>''',
'''<h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ArrowLeftRight className="h-4 w-4 text-primary" />Transações · {selectedMonthLabel.split(" ")[0]}</h2>'''
))

for old, new in repls:
    count = s.count(old)
    if count == 0:
        raise SystemExit(f"Expected marker not found: {old[:100]!r}")
    # Account/subaccount link markers can appear more than once; replace all intentionally.
    s = s.replace(old, new)

# Verification markers
checks = [
    'const [selectedMonth, setSelectedMonth]',
    'const displayAccounts = useMemo',
    'const selectedMonthTransactions = useMemo',
    'Visão mensal',
    'Previsto até o fim do mês',
    'month: selectedMonthKey',
]
for marker in checks:
    if marker not in s:
        raise SystemExit(f"Verification marker missing: {marker}")

p.write_text(s)
print("home monthly navigation patch applied")
