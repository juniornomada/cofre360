from pathlib import Path

# 1) Automatic balance adjustments: persist as dd-MM-yyyy.
p = Path('src/routes/accounts.tsx')
s = p.read_text()
old_date = 'date: format(new Date(), "dd MMM", { locale: ptBR }),' 
count = s.count(old_date)
if count < 1:
    raise SystemExit('No automatic adjustment date writes found')
s = s.replace(old_date, 'date: format(new Date(), "dd-MM-yyyy"),')
p.write_text(s)
print(f'accounts.tsx: normalized {count} automatic date write(s)')

# 2) Home: parse all supported legacy formats and always display dd-MM-yyyy.
p = Path('src/routes/home.tsx')
s = p.read_text()
old_safe = '''function safeDate(value: string | null) {
  if (!value) return null;
  const iso = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parts = value.trim().toLowerCase().split(/\\s+/);
  const months: Record<string, number> = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
    jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  if (parts.length >= 2 && months[parts[1]] !== undefined) {
    return new Date(new Date().getFullYear(), months[parts[1]], Number(parts[0]));
  }
  return null;
}
'''
new_safe = '''function safeDate(value: string | null, refIso?: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const refYear = refIso ? new Date(refIso).getFullYear() : new Date().getFullYear();

  const iso = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = trimmed.match(/^(\\d{1,2})[-/](\\d{1,2})[-/](\\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parts = trimmed.split(/\\s+/);
  const months: Record<string, number> = {
    jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
    jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  };
  if (parts.length >= 2 && months[parts[1]] !== undefined) {
    const year = parts[2] ? Number(parts[2]) : refYear;
    return new Date(year, months[parts[1]], Number(parts[0]));
  }
  return null;
}

function formatDisplayDate(value: string | null, refIso?: string | null) {
  const parsed = safeDate(value, refIso);
  if (!parsed) return value || "";
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${parsed.getFullYear()}`;
}
'''
if old_safe not in s:
    raise SystemExit('Home safeDate block not found')
s = s.replace(old_safe, new_safe, 1)
s = s.replace('safeDate(tx.date)', 'safeDate(tx.date, tx.created_at)')
old_render = '{tx.category || "Sem categoria"} · {tx.date || ""}'
new_render = '{tx.category || "Sem categoria"} · {formatDisplayDate(tx.date, tx.created_at)}'
if old_render not in s:
    raise SystemExit('Home recent date render not found')
s = s.replace(old_render, new_render, 1)
p.write_text(s)

# 3) Transaction list cards: normalize all supported formats to dd-MM-yyyy.
p = Path('src/components/TransactionItem.tsx')
s = p.read_text()
start = s.index('function formatTxDate(')
end = s.index('\n}\n\ninterface TransactionItemProps', start) + 2
new_fn = '''function formatTxDate(date: string, refIso?: string): string {
  const trimmed = date.trim().toLowerCase();
  const refYear = refIso ? new Date(refIso).getFullYear() : new Date().getFullYear();

  const iso = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const dmy = trimmed.match(/^(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{4}))?$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dd}-${mm}-${dmy[3] || refYear}`;
  }

  const compact = trimmed.match(/^(\\d{1,2})\\s+([a-zç]{3})(?:\\s+(\\d{4}))?$/i);
  if (compact) {
    const month = MONTHS_PT_ABBR.indexOf(compact[2]);
    if (month >= 0) {
      const dd = compact[1].padStart(2, "0");
      const mm = String(month + 1).padStart(2, "0");
      return `${dd}-${mm}-${compact[3] || refYear}`;
    }
  }
  return date;
}'''
s = s[:start] + new_fn + s[end:]
s = s.replace('  date: string;\n  amount: number;', '  date: string;\n  created_at?: string;\n  amount: number;', 1)
s = s.replace('  icon, name, category, date, amount, type, card, cardBrand, ', '  icon, name, category, date, created_at, amount, type, card, cardBrand, ', 1)
s = s.replace('{formatTxDate(date)}', '{formatTxDate(date, created_at)}', 1)
s = s.replace('text-right w-[42px]', 'text-right w-[72px]', 1)
p.write_text(s)

# 4) Editor: selecting a calendar date also persists dd-MM-yyyy.
p = Path('src/routes/transactions.tsx')
s = p.read_text()
old = 'onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) }); }}'
new = 'onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd-MM-yyyy") }); }}'
if old not in s:
    raise SystemExit('Transaction editor calendar write not found')
s = s.replace(old, new, 1)
p.write_text(s)

print('Date format patch prepared successfully')
