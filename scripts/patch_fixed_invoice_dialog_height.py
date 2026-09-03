from pathlib import Path

p = Path('src/routes/cards.tsx')
s = p.read_text()

old = 'className="max-w-md mx-auto rounded-2xl max-h-[85vh] flex flex-col p-0 gap-0"'
new = 'className="max-w-md mx-auto rounded-2xl h-[85dvh] max-h-[85dvh] flex flex-col overflow-hidden p-0 gap-0"'
if old not in s:
    raise SystemExit('invoice dialog class anchor not found')
s = s.replace(old, new, 1)

old = '<DialogHeader className="px-5 pt-5 pb-3">'
new = '<DialogHeader className="shrink-0 px-5 pt-5 pb-3">'
if old not in s:
    raise SystemExit('invoice header anchor not found')
s = s.replace(old, new, 1)

old = '<div className="flex items-center gap-2 px-5 pb-3">'
new = '<div className="shrink-0 flex items-center gap-2 px-5 pb-3">'
if old not in s:
    raise SystemExit('invoice month navigation anchor not found')
s = s.replace(old, new, 1)

old = '<div className="mx-5 mb-4 flex flex-col gap-3">'
new = '<div className="shrink-0 mx-5 mb-4 flex flex-col gap-3">'
if old not in s:
    raise SystemExit('invoice summary anchor not found')
s = s.replace(old, new, 1)

old = 'className="flex-1 overflow-y-auto px-5 pb-5"'
new = 'className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5"'
if old not in s:
    raise SystemExit('invoice scroll anchor not found')
s = s.replace(old, new, 1)

p.write_text(s)
print('fixed invoice dialog height patch prepared')
