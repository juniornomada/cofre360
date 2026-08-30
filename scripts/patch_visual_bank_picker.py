from pathlib import Path

p = Path("src/routes/transactions.tsx")
s = p.read_text()

replacements = [
    (
        'supabase.from("bank_accounts").select("id, name, balance").order("created_at", { ascending: true }),',
        'supabase.from("bank_accounts").select("id, name, balance, icon, color").order("created_at", { ascending: true }),',
    ),
    (
'''     const isCreditExpense = editTx.type === "expense" && editTx.bank_account_id === null;
     const hasValidCard = !!editTx.card && editTx.card !== "Nenhum";
     if (isCreditExpense && !hasValidCard) {
       toast.error("Selecione o cartão de crédito antes de salvar a transação.");
       return;
     }
 ''',
'''     const isCreditExpense = editTx.type === "expense" && editTx.bank_account_id === null;
     const hasValidCard = !!editTx.card && editTx.card !== "Nenhum";
     if (isCreditExpense && !hasValidCard) {
       toast.error("Selecione o cartão de crédito antes de salvar a transação.");
       return;
     }

     const isDebitExpense = editTx.type === "expense" && editTx.card === null;
     if (isDebitExpense && !editTx.bank_account_id) {
       toast.error("Selecione a conta bancária antes de salvar a transação.");
       return;
     }
 ''',
    ),
    (
'''                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, card: null, bank_account_id: editTx.bank_account_id || (bankAccounts[0]?.id ?? null) })}
                    className={`min-w-0 rounded-xl px-2 py-2 text-[11px] leading-tight font-medium transition-colors ${editTx.bank_account_id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    🏦 Conta (Débito)
                  </button>
''',
'''                  <button
                    type="button"
                    onClick={() => setEditTx({ ...editTx, card: null, bank_account_id: editTx.bank_account_id || "" })}
                    className={`min-w-0 rounded-xl px-2 py-2 text-[11px] leading-tight font-medium transition-colors ${editTx.card === null ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    🏦 Conta (Débito)
                  </button>
''',
    ),
    (
'''              {editTx.bank_account_id !== null && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Conta Bancária</label>
                  <Select value={editTx.bank_account_id || ""} onValueChange={(v) => setEditTx({ ...editTx, bank_account_id: v || null, card: null })}>
                    <SelectTrigger className="w-full rounded-xl bg-card border-none h-10 text-sm">
                      <SelectValue placeholder="Selecionar conta">
                        {editTx.bank_account_id && (() => {
                          const acc = bankAccounts.find(a => a.id === editTx.bank_account_id);
                          if (!acc) return "Selecionar conta";
                          return (
                            <div className="flex items-center gap-2 min-w-0">
                              <BankLogo icon={acc.icon || "custom"} color={acc.color || "from-gray-500 to-gray-700"} name={acc.name} size="xs" />
                              <span className="truncate">{acc.name}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <BankLogo icon={a.icon || "custom"} color={a.color || "from-gray-500 to-gray-700"} name={a.name} size="xs" />
                            <span>{a.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
''',
'''              {editTx.card === null && (
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground mb-2 block">Conta Bancária</label>
                  {bankAccounts.length > 0 ? (
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                      {bankAccounts.map((a) => {
                        const selected = editTx.bank_account_id === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setEditTx({ ...editTx, bank_account_id: a.id, card: null })}
                            className={cn(
                              "flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left transition-all",
                              selected
                                ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                                : "border-border bg-card hover:bg-accent/60"
                            )}
                          >
                            <BankLogo
                              icon={a.icon || "custom"}
                              color={a.color || "from-gray-500 to-gray-700"}
                              name={a.name}
                              size="xs"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-foreground">{a.name}</span>
                            </span>
                            {selected && <CheckSquare className="h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-card p-3 text-center text-xs text-muted-foreground">
                      Nenhuma conta cadastrada.
                    </div>
                  )}
                  {!editTx.bank_account_id ? (
                    <p className="mt-2 text-[10px] font-medium text-destructive">Selecione uma conta para habilitar Salvar alterações.</p>
                  ) : null}
                </div>
              )}
''',
    ),
    (
'''              disabled={!!editTx && editTx.type === "expense" && editTx.bank_account_id === null && (!editTx.card || editTx.card === "Nenhum")}
''',
'''              disabled={!!editTx && editTx.type === "expense" && (
                (editTx.bank_account_id === null && (!editTx.card || editTx.card === "Nenhum")) ||
                (editTx.card === null && !editTx.bank_account_id)
              )}
''',
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit(f"Expected block not found; refusing unsafe patch: {old[:180]!r}")
    s = s.replace(old, new, 1)

checks = [
    'select("id, name, balance, icon, color")',
    'aria-pressed={selected}',
    'Selecione a conta bancária antes de salvar a transação.',
    'Selecione uma conta para habilitar Salvar alterações.',
    'editTx.card === null && !editTx.bank_account_id',
]
for check in checks:
    if check not in s:
        raise SystemExit(f"Verification failed: {check}")

p.write_text(s)
print("visual bank picker patch ready")
