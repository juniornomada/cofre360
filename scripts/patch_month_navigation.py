from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

# ---------------- Transactions ----------------
tx_path = Path("src/routes/transactions.tsx")
tx = tx_path.read_text()

tx = replace_once(
    tx,
    '  const [activeCategory, setActiveCategory] = useState(searchParams.category || "Todas");\n',
    '''  const [activeCategory, setActiveCategory] = useState(searchParams.category || "Todas");
  const initialMonthParam = typeof searchParams.month === "string" && /^\\d{4}-\\d{2}$/.test(searchParams.month)
    ? searchParams.month
    : null;
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    if (initialMonthParam) {
      const [year, month] = initialMonthParam.split("-").map(Number);
      return new Date(year, month - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (typeof searchParams.month !== "string" || !/^\\d{4}-\\d{2}$/.test(searchParams.month)) return;
    const [year, month] = searchParams.month.split("-").map(Number);
    setSelectedMonth(new Date(year, month - 1, 1));
  }, [searchParams.month]);
''',
    "transactions selected month state",
)

tx = replace_once(tx, '  const PAGE_SIZE = 50;\n', '  const PAGE_SIZE = 1000;\n', "transactions page size")

tx = replace_once(
    tx,
    '''  const toUtcDay = (d: Date, endOfDay = false) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));

  const minAmt = filterMinAmount ? parseFloat(filterMinAmount) : null;
''',
    '''  const toUtcDay = (d: Date, endOfDay = false) =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0));

  const selectedMonthStartUtc = Date.UTC(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const selectedMonthEndUtc = Date.UTC(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1) - 1;
  const selectedMonthLabelRaw = format(selectedMonth, "MMMM yyyy", { locale: ptBR });
  const selectedMonthLabel = selectedMonthLabelRaw.charAt(0).toUpperCase() + selectedMonthLabelRaw.slice(1);
  const shiftSelectedMonth = (delta: number) => {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const minAmt = filterMinAmount ? parseFloat(filterMinAmount) : null;
''',
    "transactions month helpers",
)

tx = replace_once(
    tx,
    '''  const filtered = transactions.filter((tx) => {
    const matchesCategory = activeCategory === "Todas" || tx.category === activeCategory || parseCategoryValue(tx.category).group === activeCategory || (activeCategory === "Transferências" && (tx.category === "Transferência" || tx.category === "Transferências"));
    const matchesSource = activeSource === "all"
      ? true
      : activeSource === "card"
        ? !!tx.card
        : !!tx.bank_account_id && !tx.card;
    const matchesAccount = !filterAccountId || tx.bank_account_id === filterAccountId;
    const matchesType = filterType === "all" ? true : tx.type === filterType;
    const matchesMin = minAmt === null || Number(tx.amount) >= minAmt;
    const matchesMax = maxAmt === null || Number(tx.amount) <= maxAmt;
    let matchesDate = true;
    if (filterStartDate || filterEndDate) {
      const d = parseTxDate(tx.date, tx.created_at);
      if (!d) matchesDate = false;
      else {
        if (filterStartDate && d.getTime() < toUtcDay(filterStartDate).getTime()) matchesDate = false;
        if (filterEndDate && d.getTime() > toUtcDay(filterEndDate, true).getTime()) matchesDate = false;
      }
    }
    return matchesCategory && matchesSource && matchesAccount && matchesType && matchesMin && matchesMax && matchesDate;
  });
''',
    '''  const filtered = transactions.filter((tx) => {
    const matchesCategory = activeCategory === "Todas" || tx.category === activeCategory || parseCategoryValue(tx.category).group === activeCategory || (activeCategory === "Transferências" && (tx.category === "Transferência" || tx.category === "Transferências"));
    const matchesSource = activeSource === "all"
      ? true
      : activeSource === "card"
        ? !!tx.card
        : !!tx.bank_account_id && !tx.card;
    const matchesAccount = !filterAccountId || tx.bank_account_id === filterAccountId;
    const matchesType = filterType === "all" ? true : tx.type === filterType;
    const matchesMin = minAmt === null || Number(tx.amount) >= minAmt;
    const matchesMax = maxAmt === null || Number(tx.amount) <= maxAmt;
    const d = parseTxDate(tx.date, tx.created_at);
    const timestamp = d?.getTime() ?? NaN;
    const matchesMonth = Number.isFinite(timestamp) && timestamp >= selectedMonthStartUtc && timestamp <= selectedMonthEndUtc;
    let matchesDate = true;
    if (filterStartDate || filterEndDate) {
      if (!d) matchesDate = false;
      else {
        if (filterStartDate && d.getTime() < toUtcDay(filterStartDate).getTime()) matchesDate = false;
        if (filterEndDate && d.getTime() > toUtcDay(filterEndDate, true).getTime()) matchesDate = false;
      }
    }
    return matchesCategory && matchesSource && matchesAccount && matchesType && matchesMin && matchesMax && matchesMonth && matchesDate;
  });
''',
    "transactions month filter",
)

month_nav = '''      {/* Navegação mensal principal */}
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-2 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => shiftSelectedMonth(-1)}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
          aria-label="Mês anterior"
          title="Mês anterior"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Período</p>
          <p className="truncate text-sm font-bold text-foreground">{selectedMonthLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftSelectedMonth(1)}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
          aria-label="Próximo mês"
          title="Próximo mês"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

'''
tx = replace_once(
    tx,
    '      {/* Source filter (default: todas) */}\n',
    month_nav + '      {/* Source filter (default: todas) */}\n',
    "transactions month navigation UI",
)

tx = replace_once(
    tx,
    '     date: (search.date as string) || undefined,\n',
    '     date: (search.date as string) || undefined,\n     month: (search.month as string) || undefined,\n',
    "transactions month search param",
)

tx_path.write_text(tx)

# ---------------- Accounts ----------------
acc_path = Path("src/routes/accounts.tsx")
acc = acc_path.read_text()

acc = replace_once(acc, 'import { format } from "date-fns";\n', 'import { format, parse } from "date-fns";\n', "accounts date imports")

acc = replace_once(
    acc,
    '''const bankColorOptions = [
''',
    '''function parseAccountTxDate(value: string, refIso?: string): Date | null {
  if (!value) return null;
  const refYear = refIso ? new Date(refIso).getFullYear() : new Date().getFullYear();
  const reference = new Date(refYear, 0, 1);
  const pattern = /^\\d{4}-\\d{2}-\\d{2}$/.test(value)
    ? "yyyy-MM-dd"
    : /^\\d{2}-\\d{2}-\\d{4}$/.test(value)
      ? "dd-MM-yyyy"
      : "dd MMM";
  try {
    const parsed = parse(value.trim(), pattern, reference, { locale: ptBR });
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

const bankColorOptions = [
''',
    "accounts date parser",
)

acc = replace_once(
    acc,
    '''  balanceVisible: boolean;
  onAddSubaccount: (account: BankAccount) => void;
};
''',
    '''  balanceVisible: boolean;
  onAddSubaccount: (account: BankAccount) => void;
  selectedMonthKey: string;
};
''',
    "accounts sortable prop type",
)

acc = replace_once(
    acc,
    '''  balanceVisible,
  onAddSubaccount,
}: SortableAccountItemProps) {
''',
    '''  balanceVisible,
  onAddSubaccount,
  selectedMonthKey,
}: SortableAccountItemProps) {
''',
    "accounts sortable prop destructure",
)

acc = replace_once(
    acc,
    '            search={{ accountId: account.id } as any}\n',
    '            search={{ accountId: account.id, month: selectedMonthKey } as any}\n',
    "accounts month link",
)

acc = replace_once(
    acc,
    '''  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [incomeByAccount, setIncomeByAccount] = useState<Record<string, number>>({});
  const [expenseByAccount, setExpenseByAccount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
''',
    '''  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [incomeByAccount, setIncomeByAccount] = useState<Record<string, number>>({});
  const [expenseByAccount, setExpenseByAccount] = useState<Record<string, number>>({});
  const [monthIncomeByAccount, setMonthIncomeByAccount] = useState<Record<string, number>>({});
  const [monthExpenseByAccount, setMonthExpenseByAccount] = useState<Record<string, number>>({});
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
''',
    "accounts month states",
)

acc = replace_once(
    acc,
    '''  const handleBulkVisibility = async (visible: boolean) => {
''',
    '''  const selectedMonthKey = format(selectedMonth, "yyyy-MM");
  const selectedMonthLabelRaw = format(selectedMonth, "MMMM yyyy", { locale: ptBR });
  const selectedMonthLabel = selectedMonthLabelRaw.charAt(0).toUpperCase() + selectedMonthLabelRaw.slice(1);
  const isCurrentSelectedMonth = (() => {
    const now = new Date();
    return now.getFullYear() === selectedMonth.getFullYear() && now.getMonth() === selectedMonth.getMonth();
  })();
  const shiftSelectedMonth = (delta: number) => {
    setSelectedMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const handleBulkVisibility = async (visible: boolean) => {
''',
    "accounts month helpers",
)

acc = replace_once(
    acc,
    '.select("bank_account_id, amount, type, is_visible, card, date")\n',
    '.select("bank_account_id, amount, type, is_visible, card, date, created_at")\n',
    "accounts transaction select created_at",
)

acc = replace_once(
    acc,
    '''      if (txData) {
        const incMap: Record<string, number> = {};
        const expMap: Record<string, number> = {};
        const todayKey = new Date().toLocaleDateString("en-CA");
        for (const tx of txData) {
          if (tx.is_visible === false) continue; // ignora transações ocultas/removidas logicamente
          // Mesma regra da Home: despesas de cartão não afetam saldo bancário.
          if (tx.type === "expense" && tx.card) continue;
          // Só compara datas ISO. Datas legadas em "dd MMM" continuam válidas e não são descartadas.
          const rawDate = typeof tx.date === "string" ? tx.date.trim() : "";
          const transactionDateKey = /^\\d{4}-\\d{2}-\\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : undefined;
          if (transactionDateKey && transactionDateKey > todayKey) continue;
          const id = tx.bank_account_id as string;
          const amt = Number(tx.amount) || 0;
          if (tx.type === "income") {
            incMap[id] = (incMap[id] || 0) + amt;
          } else {
            expMap[id] = (expMap[id] || 0) + amt;
          }
        }
        setIncomeByAccount(incMap);
        setExpenseByAccount(expMap);
      }
''',
    '''      if (txData) {
        const incMap: Record<string, number> = {};
        const expMap: Record<string, number> = {};
        const monthIncMap: Record<string, number> = {};
        const monthExpMap: Record<string, number> = {};
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const selectedMonthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 23, 59, 59, 999);
        const selectedCutoff = isCurrentSelectedMonth ? today : selectedMonthEnd;

        for (const tx of txData) {
          if (tx.is_visible === false) continue; // ignora transações ocultas/removidas logicamente
          // Mesma regra da Home: despesas de cartão não afetam saldo bancário.
          if (tx.type === "expense" && tx.card) continue;

          const transactionDate = parseAccountTxDate(typeof tx.date === "string" ? tx.date.trim() : "", tx.created_at || undefined);
          const id = tx.bank_account_id as string;
          const amt = Number(tx.amount) || 0;

          // Mapas atuais continuam alimentando ações administrativas (recalcular/ajustar saldo).
          if (!transactionDate || transactionDate <= today) {
            if (tx.type === "income") incMap[id] = (incMap[id] || 0) + amt;
            else expMap[id] = (expMap[id] || 0) + amt;
          }

          // Mapas do mês servem apenas para exibição do saldo histórico selecionado.
          if (!transactionDate || transactionDate <= selectedCutoff) {
            if (tx.type === "income") monthIncMap[id] = (monthIncMap[id] || 0) + amt;
            else monthExpMap[id] = (monthExpMap[id] || 0) + amt;
          }
        }
        setIncomeByAccount(incMap);
        setExpenseByAccount(expMap);
        setMonthIncomeByAccount(monthIncMap);
        setMonthExpenseByAccount(monthExpMap);
      }
''',
    "accounts monthly balance maps",
)

acc = replace_once(acc, '  }, []);\n\n  const sensors = useSensors(\n', '  }, [selectedMonth, isCurrentSelectedMonth]);\n\n  const sensors = useSensors(\n', "accounts fetch dependencies")

acc = replace_once(
    acc,
    '  const totalCurrent = accounts.reduce((sum, a) => sum + a.balance + (incomeByAccount[a.id] || 0) - (expenseByAccount[a.id] || 0), 0);\n',
    '  const totalCurrent = accounts.reduce((sum, a) => sum + a.balance + (monthIncomeByAccount[a.id] || 0) - (monthExpenseByAccount[a.id] || 0), 0);\n',
    "accounts selected month total",
)

accounts_month_nav = '''      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card px-2 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => shiftSelectedMonth(-1)}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
          aria-label="Mês anterior"
          title="Mês anterior"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Saldo por mês</p>
          <p className="truncate text-sm font-bold text-foreground">{selectedMonthLabel}</p>
          <p className="text-[10px] text-muted-foreground">{isCurrentSelectedMonth ? "Saldo até hoje" : "Saldo no fechamento do mês"}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftSelectedMonth(1)}
          className="interactive-button flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
          aria-label="Próximo mês"
          title="Próximo mês"
        >
          <ArrowLeft className="h-5 w-5 rotate-180" />
        </button>
      </div>
'''
acc = replace_once(
    acc,
    '      {accounts.length === 0 && (\n',
    accounts_month_nav + '      {accounts.length === 0 && (\n',
    "accounts month navigation UI",
)

acc = replace_once(
    acc,
    '''                    income={incomeByAccount[account.id] || 0}
                    expense={expenseByAccount[account.id] || 0}
''',
    '''                    income={monthIncomeByAccount[account.id] || 0}
                    expense={monthExpenseByAccount[account.id] || 0}
''',
    "accounts month display values",
)

acc = replace_once(
    acc,
    '''                    balanceVisible={balanceVisible}
                    onAddSubaccount={openAddDialog}
''',
    '''                    balanceVisible={balanceVisible}
                    onAddSubaccount={openAddDialog}
                    selectedMonthKey={selectedMonthKey}
''',
    "accounts selected month prop",
)

acc_path.write_text(acc)

print("monthly navigation patch applied")
