from pathlib import Path

path = Path('src/routes/home.tsx')
text = path.read_text()
old = '''              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{tx.name || "Transação"}</p>
                <p className="truncate text-[10px] text-muted-foreground">{tx.category || "Sem categoria"} · {formatDisplayDate(tx.date, tx.created_at)}</p>
              </div>
              <span className={cn("text-sm font-semibold tabular-nums", tx.type === "income" ? "text-primary" : "text-destructive")}>{tx.type === "income" ? "+" : "-"} R$ {fmt(tx.amount)}</span>
'''
new = '''              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{tx.name || "Transação"}</p>
                <p className="truncate text-[10px] text-muted-foreground">{tx.category || "Sem categoria"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", tx.type === "income" ? "text-primary" : "text-destructive")}>{tx.type === "income" ? "+" : "-"} R$ {fmt(tx.amount)}</p>
                <p className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">{formatDisplayDate(tx.date, tx.created_at)}</p>
              </div>
'''
if old not in text:
    raise SystemExit('target snippet not found')
path.write_text(text.replace(old, new, 1))
