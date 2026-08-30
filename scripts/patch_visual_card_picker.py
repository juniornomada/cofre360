from pathlib import Path

p = Path("src/routes/transactions.tsx")
s = p.read_text()

replacements = [
    (
        '''   const handleSaveEdit = async () => {\n     if (!editTx) return;\n ''',
        '''   const handleSaveEdit = async () => {\n     if (!editTx) return;\n\n     const isCreditExpense = editTx.type === "expense" && editTx.bank_account_id === null;\n     const hasValidCard = !!editTx.card && editTx.card !== "Nenhum";\n     if (isCreditExpense && !hasValidCard) {\n       toast.error("Selecione o cartão de crédito antes de salvar a transação.");\n       return;\n     }\n ''',
    ),
    (
        '''                    onClick={() => setEditTx({ ...editTx, bank_account_id: null, card: editTx.card || (cardOptions[0]?.name ?? null) })}\n                    className={`min-w-0 rounded-xl px-2 py-2 text-[11px] leading-tight font-medium transition-colors ${editTx.card ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}\n''',
        '''                    onClick={() => setEditTx({ ...editTx, bank_account_id: null, card: editTx.card && editTx.card !== "Nenhum" ? editTx.card : "" })}\n                    className={`min-w-0 rounded-xl px-2 py-2 text-[11px] leading-tight font-medium transition-colors ${editTx.bank_account_id === null ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}\n''',
    ),
    (
        '''              {editTx.card !== null && (\n                <div>\n                  <label className="text-xs text-muted-foreground mb-1 block">Cartão de Crédito</label>\n                  <select \n                    value={editTx.card || ""} \n                    onChange={e => setEditTx({ ...editTx, card: e.target.value || null, bank_account_id: null })} \n                    className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"\n                  >\n                    {cardOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}\n                  </select>\n                </div>\n              )}\n''',
        '''              {editTx.card !== null && (\n                <div className="min-w-0">\n                  <label className="text-xs text-muted-foreground mb-2 block">Cartão de Crédito</label>\n                  {cardOptions.filter(c => c.name !== "Nenhum").length > 0 ? (\n                    <div className="grid min-w-0 grid-cols-2 gap-2">\n                      {cardOptions.filter(c => c.name !== "Nenhum").map((c) => {\n                        const selected = editTx.card === c.name;\n                        const brandLabel = c.brand?.trim()\n                          ? c.brand.trim().slice(0, 4).toUpperCase()\n                          : "💳";\n                        return (\n                          <button\n                            key={c.name}\n                            type="button"\n                            aria-pressed={selected}\n                            onClick={() => setEditTx({ ...editTx, card: c.name, bank_account_id: null })}\n                            className={cn(\n                              "flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left transition-all",\n                              selected\n                                ? "border-primary bg-primary/10 ring-1 ring-primary/30"\n                                : "border-border bg-card hover:bg-accent/60"\n                            )}\n                          >\n                            <span className={cn(\n                              "flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border text-[9px] font-black tracking-tight",\n                              selected\n                                ? "border-primary/40 bg-primary text-primary-foreground"\n                                : "border-border bg-background text-foreground"\n                            )}>\n                              {brandLabel}\n                            </span>\n                            <span className="min-w-0 flex-1">\n                              <span className="block truncate text-xs font-semibold text-foreground">{c.name}</span>\n                              {c.brand && (\n                                <span className="block truncate text-[9px] text-muted-foreground">{c.brand}</span>\n                              )}\n                            </span>\n                            {selected && <CheckSquare className="h-4 w-4 shrink-0 text-primary" />}\n                          </button>\n                        );\n                      })}\n                    </div>\n                  ) : (\n                    <div className="rounded-xl border border-dashed border-border bg-card p-3 text-center text-xs text-muted-foreground">\n                      Nenhum cartão cadastrado.\n                    </div>\n                  )}\n                  {!editTx.card || editTx.card === "Nenhum" ? (\n                    <p className="mt-2 text-[10px] font-medium text-destructive">Selecione um cartão para habilitar Salvar alterações.</p>\n                  ) : null}\n                </div>\n              )}\n''',
    ),
    (
        '''            <Button size="sm" className="flex-1 h-10 text-xs rounded-xl font-bold" onClick={handleSaveEdit}>Salvar alterações</Button>\n''',
        '''            <Button\n              size="sm"\n              className="flex-1 h-10 text-xs rounded-xl font-bold"\n              onClick={handleSaveEdit}\n              disabled={!!editTx && editTx.type === "expense" && editTx.bank_account_id === null && (!editTx.card || editTx.card === "Nenhum")}\n            >\n              Salvar alterações\n            </Button>\n''',
    ),
]

for old, new in replacements:
    if old not in s:
        raise SystemExit(f"Expected block not found; refusing unsafe patch: {old[:180]!r}")
    s = s.replace(old, new, 1)

p.write_text(s)

checks = [
    'aria-pressed={selected}',
    'Selecione o cartão de crédito antes de salvar a transação.',
    'disabled={!!editTx',
]
for check in checks:
    if check not in s:
        raise SystemExit(f"Verification failed: {check}")

print("visual card picker patch applied successfully")
