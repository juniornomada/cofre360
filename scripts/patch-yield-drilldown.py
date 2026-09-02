from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


accounts_path = Path("src/routes/accounts.tsx")
accounts = accounts_path.read_text()

accounts = replace_once(
    accounts,
    'import { parseCategoryValue } from "@/lib/categories";',
    'import { accountYieldDeltaCents } from "@/lib/account-yield";',
    "accounts yield import",
)

old_yield_block = '''            // Regra de rendimento da subconta:
            //   juros/rendimentos - IR - IOF - taxas bancárias de resgate.
            // Transferências (aporte/resgate) nunca entram aqui.
            const parsedCategory = parseCategoryValue(String(tx.category || ""));
            const normalizedName = String(tx.name || "")
              .normalize("NFD")
              .replace(/[\\u0300-\\u036f]/g, "")
              .toLowerCase();
            const amountCents = Math.round(amt * 100);
            const isInterestIncome =
              tx.type === "income" &&
              parsedCategory.group === "Receita" &&
              parsedCategory.sub === "Juros";
            const isInvestmentFee =
              tx.type === "expense" && (
                (parsedCategory.group === "Impostos/Taxas" &&
                  (parsedCategory.sub === "IR" || parsedCategory.sub === "Taxas Bancárias")) ||
                /\\biof\\b/.test(normalizedName) ||
                normalizedName.includes("imposto de renda")
              );

            if (isInterestIncome) {
              yieldCentsMap[id] = (yieldCentsMap[id] || 0) + amountCents;
            } else if (isInvestmentFee) {
              yieldCentsMap[id] = (yieldCentsMap[id] || 0) - amountCents;
            }
'''
new_yield_block = '''            // A mesma regra alimenta o valor exibido e a auditoria em Transações.
            const yieldDeltaCents = accountYieldDeltaCents(tx);
            if (yieldDeltaCents !== 0) {
              yieldCentsMap[id] = (yieldCentsMap[id] || 0) + yieldDeltaCents;
            }
'''
accounts = replace_once(accounts, old_yield_block, new_yield_block, "accounts yield calculation")

old_yield_span = '''                    <span className={cn(
                      "text-[11px] tabular-nums leading-tight font-medium",
                      performance > 0 ? "text-primary" : performance < 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      Rendimento: {balanceVisible
                        ? `${formatSignedBRL(performance)} (${performancePct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`
                        : "R$ ••••"}
                    </span>
'''
new_yield_span = '''                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        window.location.assign(
                          `/transactions?accountId=${encodeURIComponent(account.id)}&month=${encodeURIComponent(selectedMonthKey)}&yield=1`,
                        );
                      }}
                      className={cn(
                        "text-[11px] tabular-nums leading-tight font-medium text-left hover:underline underline-offset-2",
                        performance > 0 ? "text-primary" : performance < 0 ? "text-destructive" : "text-muted-foreground"
                      )}
                      title="Ver composição do rendimento"
                    >
                      Rendimento: {balanceVisible
                        ? `${formatSignedBRL(performance)} (${performancePct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`
                        : "R$ ••••"}
                    </button>
'''
accounts = replace_once(accounts, old_yield_span, new_yield_span, "clickable yield")
accounts_path.write_text(accounts)


tx_path = Path("src/routes/transactions.tsx")
tx = tx_path.read_text()

tx = replace_once(
    tx,
    'import { parseCategoryValue, getCategoryIcon, categoryTree } from "@/lib/categories";',
    'import { parseCategoryValue, getCategoryIcon, categoryTree } from "@/lib/categories";\nimport { isAccountYieldComponent } from "@/lib/account-yield";',
    "transactions yield import",
)

tx = replace_once(
    tx,
    '''  const searchParams = Route.useSearch();
  const shouldReturnHome = searchParams.from === "home";
''',
    '''  const searchParams = Route.useSearch();
  const isYieldView = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("yield") === "1";
  const shouldReturnHome = searchParams.from === "home";
''',
    "yield view flag",
)

old_account_effect = '''  useEffect(() => {
    if (searchParams.accountId) {
      setFilterAccountId(searchParams.accountId);
      setActiveSource("account");
      localStorage.setItem("transactions_filter_accountId", searchParams.accountId);
      localStorage.setItem("transactions_filter_source", "account");
      setShowAdvancedFilters(false);
    }
  }, [searchParams.accountId]);
'''
new_account_effect = '''  useEffect(() => {
    if (searchParams.accountId) {
      setFilterAccountId(searchParams.accountId);
      setActiveSource("account");
      localStorage.setItem("transactions_filter_accountId", searchParams.accountId);
      localStorage.setItem("transactions_filter_source", "account");
      setShowAdvancedFilters(false);
    }
    if (isYieldView) {
      setActiveCategory("Todas");
      setActiveSource("account");
      setFilterStartDate(undefined);
      setFilterEndDate(undefined);
      setFilterMinAmount("");
      setFilterMaxAmount("");
      setFilterType("all");
      setSortBy("date-desc");
    }
  }, [searchParams.accountId, isYieldView]);
'''
tx = replace_once(tx, old_account_effect, new_account_effect, "yield filter reset")

old_initial_fetch = '''  useEffect(() => {
    void fetchTransactions();
    fetchCards();
    fetchBankAccounts();
  }, [fetchTransactions, fetchCards, fetchBankAccounts]);
'''
new_initial_fetch = '''  useEffect(() => {
    void fetchTransactions();
    fetchCards();
    fetchBankAccounts();
  }, [fetchTransactions, fetchCards, fetchBankAccounts]);

  // A composição de rendimento é uma auditoria acumulada: carregue todas as
  // páginas automaticamente para não omitir juros ou taxas antigos.
  useEffect(() => {
    if (!isYieldView || loading || loadingMore || !hasMore) return;
    void fetchTransactionsPage(false);
  }, [isYieldView, loading, loadingMore, hasMore, fetchTransactionsPage]);
'''
tx = replace_once(tx, old_initial_fetch, new_initial_fetch, "yield auto pagination")

old_month_bounds = '''  const selectedMonthStartUtc = Date.UTC(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const selectedMonthEndUtc = Date.UTC(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1) - 1;
  const selectedMonthLabelRaw = format(selectedMonth, "MMMM yyyy", { locale: ptBR });
'''
new_month_bounds = '''  const selectedMonthStartUtc = Date.UTC(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const selectedMonthEndUtc = Date.UTC(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1) - 1;
  const nowForYield = new Date();
  const isCurrentYieldMonth =
    selectedMonth.getFullYear() === nowForYield.getFullYear() &&
    selectedMonth.getMonth() === nowForYield.getMonth();
  const yieldCutoffUtc = isCurrentYieldMonth
    ? Date.UTC(nowForYield.getFullYear(), nowForYield.getMonth(), nowForYield.getDate(), 23, 59, 59, 999)
    : selectedMonthEndUtc;
  const selectedMonthLabelRaw = format(selectedMonth, "MMMM yyyy", { locale: ptBR });
'''
tx = replace_once(tx, old_month_bounds, new_month_bounds, "yield cutoff")

old_filter_part = '''    const d = parseTxDate(tx.date, tx.created_at);
    const timestamp = d?.getTime() ?? NaN;
    const matchesMonth = Number.isFinite(timestamp) && timestamp >= selectedMonthStartUtc && timestamp <= selectedMonthEndUtc;
    let matchesDate = true;
'''
new_filter_part = '''    const d = parseTxDate(tx.date, tx.created_at);
    const timestamp = d?.getTime() ?? NaN;
    const matchesYieldComponent = !isYieldView || isAccountYieldComponent(tx);
    const matchesMonth = isYieldView
      ? (!d || timestamp <= yieldCutoffUtc)
      : Number.isFinite(timestamp) && timestamp >= selectedMonthStartUtc && timestamp <= selectedMonthEndUtc;
    let matchesDate = true;
'''
tx = replace_once(tx, old_filter_part, new_filter_part, "yield transaction predicate")

tx = replace_once(
    tx,
    '    return matchesCategory && matchesSource && matchesAccount && matchesMin && matchesMax && matchesMonth && matchesDate;',
    '    return matchesCategory && matchesSource && matchesAccount && matchesMin && matchesMax && matchesMonth && matchesDate && matchesYieldComponent;',
    "yield filter return",
)

old_account_chip = '''                    <div className="flex items-center gap-2 rounded-full bg-accent/50 px-2.5 py-1 border border-border/50">
                      <BankLogo icon={acc.icon || "custom"} color={acc.color || ""} name={acc.name} size="xs" />
                      <span className="text-xs font-semibold text-muted-foreground truncate max-w-[150px]">{acc.name}</span>
                    </div>
                    <button 
                      onClick={() => {
                        setFilterAccountId(null);
                        localStorage.removeItem("transactions_filter_accountId");
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                      title="Remover filtro de conta"
                    >
                      <X className="h-3 w-3" />
                    </button>
'''
new_account_chip = '''                    <div className="flex items-center gap-2 rounded-full bg-accent/50 px-2.5 py-1 border border-border/50">
                      <BankLogo icon={acc.icon || "custom"} color={acc.color || ""} name={acc.name} size="xs" />
                      <span className="text-xs font-semibold text-muted-foreground truncate max-w-[150px]">{acc.name}</span>
                    </div>
                    {isYieldView && (
                      <div className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        <span aria-hidden="true">📈</span>
                        Rendimento
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        if (isYieldView) {
                          window.location.assign(
                            `/transactions?accountId=${encodeURIComponent(acc.id)}&month=${encodeURIComponent(format(selectedMonth, "yyyy-MM"))}`,
                          );
                          return;
                        }
                        setFilterAccountId(null);
                        localStorage.removeItem("transactions_filter_accountId");
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                      title={isYieldView ? "Remover filtro de rendimento" : "Remover filtro de conta"}
                    >
                      <X className="h-3 w-3" />
                    </button>
'''
tx = replace_once(tx, old_account_chip, new_account_chip, "yield header chip")

old_month_nav = '''      {/* Navegação mensal principal */}
      <div className="sticky top-0 z-30 -mx-1 flex items-center justify-between rounded-2xl border border-border/50 bg-card/95 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
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
          <p className="truncate text-base font-bold text-foreground">{selectedMonthLabel}</p>
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
new_month_nav = '''      {/* Navegação mensal principal / auditoria acumulada de rendimento */}
      {isYieldView ? (
        <div className="sticky top-0 z-30 -mx-1 rounded-2xl border border-primary/20 bg-card/95 px-3 py-2.5 text-center shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <p className="text-sm font-bold text-foreground">Composição do rendimento</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Juros − IR − IOF − taxas</p>
          <p className="mt-0.5 text-[10px] font-medium text-primary">Todo o período até {selectedMonthLabel}</p>
        </div>
      ) : (
        <div className="sticky top-0 z-30 -mx-1 flex items-center justify-between rounded-2xl border border-border/50 bg-card/95 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
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
            <p className="truncate text-base font-bold text-foreground">{selectedMonthLabel}</p>
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
      )}
'''
tx = replace_once(tx, old_month_nav, new_month_nav, "yield period header")

tx = replace_once(
    tx,
    '      {monthCategoryRanking.length > 0 && (',
    '      {!isYieldView && monthCategoryRanking.length > 0 && (',
    "hide category filters in yield view",
)

old_source_start = '''      {/* 3. Origem: Conta / Cartão */}
      <div className="grid grid-cols-2 gap-2">
'''
new_source_start = '''      {/* 3. Origem: Conta / Cartão */}
      {!isYieldView && <div className="grid grid-cols-2 gap-2">
'''
tx = replace_once(tx, old_source_start, new_source_start, "hide source start")
# Close the conditional immediately before the Receitas/Despesas section.
tx = replace_once(
    tx,
    '''      </div>

      {/* 4. Receitas / Despesas: resumo original + filtro ao tocar */}
''',
    '''      </div>}

      {/* 4. Receitas / Despesas: resumo original + filtro ao tocar */}
''',
    "hide source end",
)

tx = replace_once(tx, '            Receitas\n', '            {isYieldView ? "Juros" : "Receitas"}\n', "yield income label")
tx = replace_once(tx, '            Despesas\n', '            {isYieldView ? "Taxas" : "Despesas"}\n', "yield expense label")

old_summary_end = '''      </section>


       <div ref={listRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
'''
new_summary_end = '''      </section>
      {isYieldView && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">Rendimento líquido</span>
          <span className={cn(
            "text-sm font-bold tabular-nums",
            totalIncome - totalExpense >= 0 ? "text-primary" : "text-destructive",
          )}>
            {balanceVisible ? `${totalIncome - totalExpense >= 0 ? "+" : ""}R$ ${formatCurrency(totalIncome - totalExpense)}` : "R$ ••••"}
          </span>
        </div>
      )}


       <div ref={listRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
'''
tx = replace_once(tx, old_summary_end, new_summary_end, "yield net summary")

# The category chart is useful in normal monthly browsing, but would be a second,
# conflicting filter in the yield audit view.
tx = replace_once(
    tx,
    '''      {/* Pie Charts */}
      <div className="mt-8 mb-8">
        <CategoryPieCharts
''',
    '''      {/* Pie Charts */}
      {!isYieldView && <div className="mt-8 mb-8">
        <CategoryPieCharts
''',
    "hide chart start",
)
tx = replace_once(
    tx,
    '''        />
      </div>

      {/* Edit Dialog */}
''',
    '''        />
      </div>}

      {/* Edit Dialog */}
''',
    "hide chart end",
)

tx_path.write_text(tx)
print("yield drilldown patch applied")
