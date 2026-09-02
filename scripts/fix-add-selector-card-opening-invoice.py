from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} not found")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Transactions: restore the type chooser before opening Quick Add.
# ---------------------------------------------------------------------------
transactions_path = Path("src/routes/transactions.tsx")
transactions = transactions_path.read_text()

transactions = replace_once(
    transactions,
    '   const [showAddDialog, setShowAddDialog] = useState(false);\n',
    '   const [showAddDialog, setShowAddDialog] = useState(false);\n'
    '   const [showAddTypeDialog, setShowAddTypeDialog] = useState(false);\n',
    "showAddTypeDialog state",
)

old_effect = '''  useEffect(() => {
    if (searchParams.action === "add") {
      if (searchParams.type === "transfer") {
        setQuickAddType("transfer");
      } else {
        setQuickAddType(searchParams.type === "income" ? "income" : "expense");
      }
      setShowAddDialog(true);
    }
  }, [searchParams.action, searchParams.type]);'''
new_effect = '''  useEffect(() => {
    if (searchParams.action !== "add") return;

    // Links with an explicit type (for example, adding a purchase from a card
    // invoice) can still open Quick Add directly. A plain `+` must ask the
    // user what kind of transaction they want first.
    if (searchParams.type === "expense" || searchParams.type === "income" || searchParams.type === "transfer") {
      setQuickAddType(searchParams.type);
      setShowAddTypeDialog(false);
      setShowAddDialog(true);
      return;
    }

    setCopyTxData(null);
    setShowAddDialog(false);
    setShowAddTypeDialog(true);
  }, [searchParams.action, searchParams.type]);'''
transactions = replace_once(transactions, old_effect, new_effect, "add action effect")

old_plus = '''              <button onClick={() => setShowAddDialog(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground border border-primary/20 shadow-lg hover:brightness-110 transition-all">
                <Plus className="h-5 w-5" />
              </button>'''
new_plus = '''              <button
                onClick={() => {
                  setCopyTxData(null);
                  setShowAddDialog(false);
                  setShowAddTypeDialog(true);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground border border-primary/20 shadow-lg hover:brightness-110 transition-all"
                aria-label="Adicionar transação"
                title="Adicionar transação"
              >
                <Plus className="h-5 w-5" />
              </button>'''
transactions = replace_once(transactions, old_plus, new_plus, "transactions plus button")

chooser = '''
      {/* Choose transaction type before opening Quick Add */}
      <Dialog open={showAddTypeDialog} onOpenChange={setShowAddTypeDialog}>
        <DialogContent className="max-w-[360px] rounded-2xl bg-background">
          <DialogHeader>
            <DialogTitle>Nova transação</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-2">
            <button
              type="button"
              onClick={() => {
                setQuickAddType("expense");
                setShowAddTypeDialog(false);
                setShowAddDialog(true);
              }}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-2 text-destructive transition-colors hover:bg-destructive/15"
            >
              <ArrowDownRight className="h-5 w-5" />
              <span className="text-xs font-semibold">Despesa</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickAddType("income");
                setShowAddTypeDialog(false);
                setShowAddDialog(true);
              }}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-2 text-primary transition-colors hover:bg-primary/15"
            >
              <ArrowUpRight className="h-5 w-5" />
              <span className="text-xs font-semibold">Receita</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickAddType("transfer");
                setShowAddTypeDialog(false);
                setShowAddDialog(true);
              }}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-foreground transition-colors hover:bg-accent"
            >
              <ArrowLeftRight className="h-5 w-5" />
              <span className="text-xs font-semibold">Transferência</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

'''
transactions = replace_once(
    transactions,
    '      {/* Add */}\n',
    chooser + '      {/* Add */}\n',
    "add dialog marker",
)

transactions_path.write_text(transactions)

# ---------------------------------------------------------------------------
# Cards: make the amount entered as "Fatura atual" part of its billing cycle.
# ---------------------------------------------------------------------------
cards_path = Path("src/routes/cards.tsx")
cards = cards_path.read_text()

cards = replace_once(
    cards,
    '  is_visible: boolean | null;\n};',
    '  is_visible: boolean | null;\n  created_at?: string | null;\n};',
    "CardData created_at",
)

invoice_import = 'import { groupByBillingCycle, parseTxDate, getCycleDates, monthNames, type CardTransaction, type InvoicePeriod } from "@/lib/invoice-utils";\n'
helper = '''import { groupByBillingCycle, parseTxDate, getCycleDates, monthNames, type CardTransaction, type InvoicePeriod } from "@/lib/invoice-utils";

// `cards.used` is the invoice amount informed when a card is first registered.
// It is an opening invoice balance, not a timeless aggregate. Associate it with
// the billing cycle that was current on the card creation date so month cards,
// invoice details and payments all agree with the consolidated total.
const getOpeningInvoicePeriodKey = (card: CardData) => {
  const openingAmount = Number(card.used || 0);
  if (openingAmount <= 0 || !card.created_at) return "";
  const createdAt = new Date(card.created_at);
  if (Number.isNaN(createdAt.getTime())) return "";
  const cycle = getCycleDates(createdAt, card.closing_day, card.due_day);
  return cycle.currentClose.toISOString().split("T")[0];
};

const getOpeningInvoiceAmountForPeriod = (card: CardData, periodKey: string) => {
  if (!periodKey || periodKey !== getOpeningInvoicePeriodKey(card)) return 0;
  return Math.max(0, Number(card.used || 0));
};

const includeOpeningInvoiceAmount = (periods: InvoicePeriod[], card: CardData) =>
  periods.map((period) => {
    const periodKey = period.endDate?.toISOString().split("T")[0] || "";
    const openingAmount = getOpeningInvoiceAmountForPeriod(card, periodKey);
    if (!openingAmount) return period;
    return {
      ...period,
      total: Math.round((Number(period.total || 0) + openingAmount) * 100) / 100,
    };
  });
'''
cards = replace_once(cards, invoice_import, helper, "opening invoice helpers")

old_periods = '''  const invoicePeriods = invoiceCard
    ? groupByBillingCycle(
        cardTransactions.filter(tx => tx.card === invoiceCard.name),
        invoiceCard.closing_day,
        invoiceCard.due_day,
        invoiceReferenceDate,
      )
    : [];'''
new_periods = '''  const invoicePeriods = invoiceCard
    ? includeOpeningInvoiceAmount(
        groupByBillingCycle(
          cardTransactions.filter(tx => tx.card === invoiceCard.name),
          invoiceCard.closing_day,
          invoiceCard.due_day,
          invoiceReferenceDate,
        ),
        invoiceCard,
      )
    : [];'''
cards = replace_once(cards, old_periods, new_periods, "invoicePeriods opening amount")

old_updated = '''      const updatedPeriods = groupByBillingCycle(
        txs,
        payingCard.closing_day,
        payingCard.due_day,
        paymentReferenceDate,
      );'''
new_updated = '''      const updatedPeriods = includeOpeningInvoiceAmount(
        groupByBillingCycle(
          txs,
          payingCard.closing_day,
          payingCard.due_day,
          paymentReferenceDate,
        ),
        payingCard,
      );'''
cards = replace_once(cards, old_updated, new_updated, "payment invoice periods")

old_card_periods = '      const invoicePeriodsCard = groupByBillingCycle(cardTransactionsFiltered, card.closing_day, card.due_day);'
new_card_periods = '      const invoicePeriodsCard = includeOpeningInvoiceAmount(groupByBillingCycle(cardTransactionsFiltered, card.closing_day, card.due_day), card);'
cards = replace_once(cards, old_card_periods, new_card_periods, "card invoice periods")

old_sel_total = '''      const selTotal = selTxs.reduce(
        (s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)),
        0,
      );'''
new_sel_total = '''      const selTransactionsTotal = selTxs.reduce(
        (s, t) => s + (t.type === "income" ? -Number(t.amount) : Number(t.amount)),
        0,
      );
      const selOpeningAmount = getOpeningInvoiceAmountForPeriod(card, selPeriodKey);
      const selTotal = Math.round((selTransactionsTotal + selOpeningAmount) * 100) / 100;'''
cards = replace_once(cards, old_sel_total, new_sel_total, "selected invoice total")

cards = replace_once(
    cards,
    '  const activePeriodKey = getInvoicePeriodKey(activePeriod);\n  const activePeriodPayments = getPaymentsForPeriod(invoiceCard?.id, activePeriod);',
    '  const activePeriodKey = getInvoicePeriodKey(activePeriod);\n'
    '  const activeOpeningInvoiceAmount = invoiceCard ? getOpeningInvoiceAmountForPeriod(invoiceCard, activePeriodKey) : 0;\n'
    '  const activePeriodPayments = getPaymentsForPeriod(invoiceCard?.id, activePeriod);',
    "active opening invoice amount",
)

cards = replace_once(
    cards,
    '                {activePeriod && activePeriod.transactions.length === 0 ? (',
    '                {activePeriod && activePeriod.transactions.length === 0 && activeOpeningInvoiceAmount <= 0 ? (',
    "invoice empty state opening amount",
)

opening_row = '''                    {activeOpeningInvoiceAmount > 0 && (
                      <div className="flex items-center gap-2 py-2.5 border-b border-border/50">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-base" aria-hidden="true">🧾</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">Fatura inicial</p>
                          <p className="truncate text-[10px] text-muted-foreground">Valor informado no cadastro do cartão</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-destructive">
                          R$ {activeOpeningInvoiceAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
'''
cards = replace_once(
    cards,
    '                    {activePeriod?.transactions.map((tx) => (\n',
    opening_row + '                    {activePeriod?.transactions.map((tx) => (\n',
    "opening invoice row",
)

cards = replace_once(
    cards,
    '                      {(!activePeriod?.transactions || activePeriod.transactions.length === 0) && (',
    '                      {activeOpeningInvoiceAmount <= 0 && (!activePeriod?.transactions || activePeriod.transactions.length === 0) && (',
    "invoice empty detail line",
)

cards_path.write_text(cards)

print("Applied add-type chooser and opening invoice cycle fix")
