from pathlib import Path

p = Path("src/routes/transactions.tsx")
s = p.read_text()

anchor = '<span className="text-xs font-medium text-foreground">Parcelamento</span>'
anchor_pos = s.index(anchor)
start_marker = '                <div className="grid grid-cols-2 gap-2">\n'
end_marker = '                {(Number(editTx.total_installments) || 1) > 1 && (\n'
start = s.index(start_marker, anchor_pos)
end = s.index(end_marker, start)

new_block = '''                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground block">Quantidade de parcelas</label>
                  <div className="grid grid-cols-[48px_1fr_48px] items-center gap-2">
                    <button
                      type="button"
                      aria-label="Diminuir quantidade de parcelas"
                      onClick={() => {
                        const currentCount = Number(editTx.total_installments) || 1;
                        if (currentCount <= 1) return;
                        const newCount = currentCount === 2 ? 1 : currentCount - 1;
                        const next = changeInstallmentCount({
                          mode: editInstallmentMode,
                          amount: editTx.amount,
                          prevCount: currentCount,
                          newCount,
                        });
                        setEditTx({
                          ...editTx,
                          total_installments: newCount > 1 ? newCount : null,
                          installment_number: newCount > 1
                            ? Math.min(Number(editTx.installment_number) || 1, newCount)
                            : null,
                          amount: next.amount,
                        });
                      }}
                      disabled={(Number(editTx.total_installments) || 1) <= 1}
                      className="h-10 rounded-xl border border-border bg-background text-lg font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      −
                    </button>
                    <div
                      aria-live="polite"
                      className="flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-bold tabular-nums text-foreground"
                    >
                      {(Number(editTx.total_installments) || 1) > 1 ? Number(editTx.total_installments) : "—"}
                    </div>
                    <button
                      type="button"
                      aria-label="Aumentar quantidade de parcelas"
                      onClick={() => {
                        const currentCount = Number(editTx.total_installments) || 1;
                        const newCount = currentCount > 1 ? currentCount + 1 : 2;
                        const next = changeInstallmentCount({
                          mode: editInstallmentMode,
                          amount: editTx.amount,
                          prevCount: currentCount,
                          newCount,
                        });
                        setEditTx({
                          ...editTx,
                          total_installments: newCount,
                          installment_number: Math.min(Number(editTx.installment_number) || 1, newCount),
                          amount: next.amount,
                        });
                      }}
                      className="h-10 rounded-xl border border-primary/40 bg-primary/10 text-lg font-bold text-primary transition-colors hover:bg-primary/20"
                    >
                      +
                    </button>
                  </div>
                </div>

'''

s = s[:start] + new_block + s[end:]
s = s.replace(
    '                  Defina o total maior que 1 para parcelar. As parcelas futuras serão criadas nos meses seguintes. Use total = 1 para remover o parcelamento.\n',
    '                  Use + para adicionar parcelas e − para reduzir. Ao voltar abaixo de 2, o parcelamento é removido.\n',
    1,
)

checks = [
    'aria-label="Diminuir quantidade de parcelas"',
    'aria-label="Aumentar quantidade de parcelas"',
    'Quantidade de parcelas',
]
for check in checks:
    if check not in s:
        raise SystemExit(f"Verification failed: {check}")

if 'Ou digite outro valor' in s[anchor_pos:]:
    raise SystemExit('Old installment preset UI still present')

p.write_text(s)
print('installment stepper patch applied')
