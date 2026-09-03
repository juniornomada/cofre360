from pathlib import Path

path = Path('src/routes/cards.tsx')
s = path.read_text()

old_row = 'className="flex items-center gap-2 py-2.5 border-b border-border/50 last:border-0"'
new_row = 'className="flex items-center gap-2.5 py-2.5 border-b border-border/50 last:border-0"'
if old_row not in s:
    raise SystemExit('invoice row class not found')
s = s.replace(old_row, new_row, 1)

old_meta = '<p className="text-[10px] text-muted-foreground">{tx.category} · {tx.date}</p>'
new_meta = '''<p className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="min-w-0 truncate">{tx.category}</span>
                            <span className="shrink-0 whitespace-nowrap">· {tx.date}</span>
                          </p>'''
if old_meta not in s:
    raise SystemExit('invoice metadata line not found')
s = s.replace(old_meta, new_meta, 1)

old_actions = 'className="flex items-center gap-1.5 group/card-tx-row relative shrink-0"'
new_actions = 'className="ml-1.5 flex items-center gap-1.5 group/card-tx-row relative shrink-0"'
if old_actions not in s:
    raise SystemExit('invoice actions class not found')
s = s.replace(old_actions, new_actions, 1)

path.write_text(s)
print('patched invoice row spacing')
