from pathlib import Path

path = Path('src/routes/transactions.tsx')
text = path.read_text()

old = '''  const nowForYield = new Date();
  const isCurrentYieldMonth =
    selectedMonth.getFullYear() === nowForYield.getFullYear() &&
    selectedMonth.getMonth() === nowForYield.getMonth();
  const yieldCutoffUtc = isCurrentYieldMonth
    ? Date.UTC(nowForYield.getFullYear(), nowForYield.getMonth(), nowForYield.getDate(), 23, 59, 59, 999)
    : selectedMonthEndUtc;
'''
if old not in text:
    raise SystemExit('yield cutoff block not found')
text = text.replace(old, '')

old = '''    const matchesMonth = isYieldView
      ? (!d || timestamp <= yieldCutoffUtc)
      : Number.isFinite(timestamp) && timestamp >= selectedMonthStartUtc && timestamp <= selectedMonthEndUtc;
'''
new = '''    // Yield audit is intentionally cumulative. Every posted interest/tax row
    // for the selected account participates regardless of calendar month.
    const matchesMonth = isYieldView
      ? true
      : Number.isFinite(timestamp) && timestamp >= selectedMonthStartUtc && timestamp <= selectedMonthEndUtc;
'''
if old not in text:
    raise SystemExit('matchesMonth block not found')
text = text.replace(old, new)

old = '''          <p className="mt-0.5 text-[10px] font-medium text-primary">Todo o período até {selectedMonthLabel}</p>
'''
new = '''          <p className="mt-0.5 text-[10px] font-medium text-primary">Todo o período</p>
'''
if old not in text:
    raise SystemExit('yield header line not found')
text = text.replace(old, new)

path.write_text(text)
