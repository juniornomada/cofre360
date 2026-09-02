from pathlib import Path

p = Path("src/routes/cards.tsx")
text = p.read_text()

anchor = 'data-testid="invoice-dialog-empty"'
anchor_pos = text.find(anchor)
if anchor_pos < 0:
    raise SystemExit("invoice dialog anchor not found")

start_marker = '''          ) : (
            <div className="flex flex-col flex-1 min-h-0">'''
end_marker = '''              {activePeriod && (
                <div className="mx-5 mb-4 flex flex-col gap-3">'''

start = text.find(start_marker, anchor_pos)
if start < 0:
    raise SystemExit("invoice body start not found")
end = text.find(end_marker, start + len(start_marker))
if end < 0:
    raise SystemExit("invoice content marker not found")

replacement = '''          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 px-5 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveInvoiceIdx(1);
                    setMonthOffset(globalMonthOffset - 1);
                  }}
                  className="interactive-button flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-muted-foreground hover:bg-accent/80 transition-colors"
                  aria-label="Fatura do mês anterior"
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="truncate text-base font-bold text-foreground">
                    {activePeriod
                      ? `${monthNames[activePeriod.dueDate.getMonth()]} ${activePeriod.dueDate.getFullYear()}`
                      : "—"}
                  </p>
                  {activePeriod && (
                    <p className="text-[10px] text-muted-foreground">
                      F {activePeriod.endDate.getDate().toString().padStart(2, "0")}/{(activePeriod.endDate.getMonth() + 1).toString().padStart(2, "0")}
                      {" · Venc "}
                      {activePeriod.dueDate.getDate().toString().padStart(2, "0")}/{(activePeriod.dueDate.getMonth() + 1).toString().padStart(2, "0")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveInvoiceIdx(1);
                    setMonthOffset(globalMonthOffset + 1);
                  }}
                  className="interactive-button flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-muted-foreground hover:bg-accent/80 transition-colors"
                  aria-label="Fatura do próximo mês"
                  title="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!invoiceCard || !rawActivePeriod) return;
                    const key = `${invoiceCard.id}::${rawActivePeriod.endDate.toISOString().split("T")[0]}`;
                    invoiceOrderRef.current.delete(key);
                    setInvoiceOrderTick((t) => t + 1);
                  }}
                  aria-label="Restaurar ordem original da fatura"
                  title="Restaurar ordem original"
                  className="interactive-button flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-muted-foreground hover:bg-accent/80 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>

              {activePeriod && (
                <div className="mx-5 mb-4 flex flex-col gap-3">'''

text = text[:start] + replacement + text[end + len(end_marker):]
p.write_text(text)
print("rebuilt invoice month navigation block")
