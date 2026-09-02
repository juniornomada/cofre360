from pathlib import Path

path = Path("src/components/QuickAddTransactionDialog.tsx")
text = path.read_text()

# New quick-add operations should always begin at installment 1, even if the
# same dialog component was previously used to add an old installment series.
reset_anchor = '    setInstallmentCount(prefs?.count ?? 2);\n    setInstallmentMode(prefs?.mode ?? "divide");\n'
reset_replacement = '    setInstallmentCount(prefs?.count ?? 2);\n    setInstallmentStart(1);\n    setInstallmentMode(prefs?.mode ?? "divide");\n'
if reset_anchor not in text:
    raise SystemExit("Installment reset anchor not found")
text = text.replace(reset_anchor, reset_replacement, 1)

start_marker = '''                      <div className="space-y-2">\n                        <div>\n                          <label className="text-[11px] font-semibold text-foreground mb-1 block">Total de parcelas</label>\n'''
end_marker = '''                        <div className="space-y-1.5 rounded-md bg-primary/5 border border-primary/20 p-2">\n'''

start = text.find(start_marker)
if start == -1:
    raise SystemExit("Old installment quantity block not found")
end = text.find(end_marker, start)
if end == -1:
    raise SystemExit("Installment preview block not found")

new_block = '''                      <div className="space-y-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-foreground mb-1 block">Total de parcelas</label>
                          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                            <button
                              type="button"
                              aria-label="Diminuir total de parcelas"
                              onClick={() => {
                                const current = Math.max(2, Number(installmentCount) || 2);
                                const next = Math.max(2, current - 1);
                                setInstallmentCount(next);
                                setInstallmentStart(prev => Math.min(Math.max(1, Number(prev) || 1), next));
                              }}
                              disabled={(Number(installmentCount) || 2) <= 2}
                              className="h-10 rounded-xl border border-border bg-card text-lg font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={2}
                              max={48}
                              value={installmentCount}
                              aria-label="Total de parcelas"
                              onChange={e => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  setInstallmentCount("");
                                  return;
                                }
                                const parsed = parseInt(raw, 10);
                                if (!Number.isFinite(parsed)) return;
                                const next = Math.min(48, Math.max(2, parsed));
                                setInstallmentCount(next);
                                setInstallmentStart(prev => Math.min(Math.max(1, Number(prev) || 1), next));
                              }}
                              onBlur={() => {
                                const current = Number(installmentCount);
                                if (!Number.isInteger(current) || current < 2) {
                                  setInstallmentCount(2);
                                  setInstallmentStart(prev => Math.min(Math.max(1, Number(prev) || 1), 2));
                                }
                              }}
                              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-center text-sm font-bold tabular-nums text-foreground outline-none focus:border-primary/60"
                            />
                            <button
                              type="button"
                              aria-label="Aumentar total de parcelas"
                              onClick={() => {
                                const current = Math.max(2, Number(installmentCount) || 2);
                                setInstallmentCount(Math.min(48, current + 1));
                              }}
                              disabled={(Number(installmentCount) || 2) >= 48}
                              className="h-10 rounded-xl border border-primary/40 bg-primary/10 text-lg font-bold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-foreground mb-1 block">
                            Parcela atual <span className="text-muted-foreground font-normal">(lançar a partir de)</span>
                          </label>
                          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                            <button
                              type="button"
                              aria-label="Diminuir parcela atual"
                              onClick={() => {
                                const current = Math.max(1, Number(installmentStart) || 1);
                                setInstallmentStart(Math.max(1, current - 1));
                              }}
                              disabled={(Number(installmentStart) || 1) <= 1}
                              className="h-10 rounded-xl border border-border bg-card text-lg font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              −
                            </button>
                            <div className="relative">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={Number(installmentCount) || 2}
                                value={installmentStart}
                                aria-label="Parcela atual"
                                aria-invalid={!!installmentStartError}
                                aria-describedby={installmentStartError ? "installment-start-error" : undefined}
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === "") {
                                    setInstallmentStart("");
                                    return;
                                  }
                                  const parsed = parseInt(raw, 10);
                                  if (!Number.isFinite(parsed)) return;
                                  const total = Math.max(2, Number(installmentCount) || 2);
                                  setInstallmentStart(Math.min(total, Math.max(1, parsed)));
                                }}
                                onBlur={() => {
                                  if (installmentStart === "") setInstallmentStart(1);
                                }}
                                className={`h-10 w-full rounded-xl bg-card px-12 text-center text-sm font-bold tabular-nums text-foreground outline-none border ${installmentStartError ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/60"}`}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-medium text-muted-foreground">
                                de {Number(installmentCount) || 2}
                              </span>
                            </div>
                            <button
                              type="button"
                              aria-label="Aumentar parcela atual"
                              onClick={() => {
                                const total = Math.max(2, Number(installmentCount) || 2);
                                const current = Math.max(1, Number(installmentStart) || 1);
                                setInstallmentStart(Math.min(total, current + 1));
                              }}
                              disabled={(Number(installmentStart) || 1) >= (Number(installmentCount) || 2)}
                              className="h-10 rounded-xl border border-primary/40 bg-primary/10 text-lg font-bold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              +
                            </button>
                          </div>
                          {!installmentStartError && (() => {
                            const total = Math.max(2, Number(installmentCount) || 2);
                            const startAt = Math.min(total, Math.max(1, Number(installmentStart) || 1));
                            const remaining = total - startAt + 1;
                            return (
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {startAt === 1
                                  ? `Serão lançadas ${remaining} parcelas (1/${total} → ${total}/${total}).`
                                  : `Lançamento retroativo: serão criadas ${remaining} parcelas (${startAt}/${total} → ${total}/${total}).`}
                              </p>
                            );
                          })()}
                          {installmentStartError && (
                            <p
                              id="installment-start-error"
                              role="alert"
                              className="mt-1 text-[11px] text-destructive"
                            >
                              {installmentStartError}
                            </p>
                          )}
                        </div>
                      </div>
'''

text = text[:start] + new_block + text[end:]

checks = [
    'aria-label="Diminuir total de parcelas"',
    'aria-label="Aumentar total de parcelas"',
    'aria-label="Diminuir parcela atual"',
    'aria-label="Aumentar parcela atual"',
    'Lançamento retroativo:',
    'Valor total da compra',
    'Valor de cada parcela',
]
for check in checks:
    if check not in text:
        raise SystemExit(f"Verification failed: {check}")

old_tokens = ['Ou digite outro valor', '{[1, 2, 3, 4, 5, 6, 7, 8].map']
for token in old_tokens:
    if token in text[start:start + len(new_block) + 1000]:
        raise SystemExit(f"Old installment UI still present: {token}")

path.write_text(text)
print("QuickAdd installment steppers restored with retroactive start support")
