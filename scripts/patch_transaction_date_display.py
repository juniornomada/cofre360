from pathlib import Path

p = Path('src/routes/transactions.tsx')
s = p.read_text()

old_parser = '''  // Parse "dd MMM" using created_at as the reference year (UTC) to avoid timezone/year drift.
  const parseTxDate = (s: string, refIso?: string): Date | null => {
    if (!s) return null;
    const refYear = refIso ? new Date(refIso).getUTCFullYear() : new Date().getUTCFullYear();
    try {
      const parsed = parse(s, "dd MMM", new Date(Date.UTC(refYear, 0, 1)), { locale: ptBR });
      if (isNaN(parsed.getTime())) return null;
      // Reconstruct in UTC to neutralize local timezone offset.
      return new Date(Date.UTC(refYear, parsed.getMonth(), parsed.getDate()));
    } catch { return null; }
  };
'''

new_parser = '''  // Accept legacy ISO dates and the app's compact date format.
  // Sorting uses UTC to avoid timezone drift; the editor uses a local date for the calendar.
  const parseTxDate = (s: string, refIso?: string): Date | null => {
    if (!s) return null;
    const refYear = refIso ? new Date(refIso).getUTCFullYear() : new Date().getUTCFullYear();
    const reference = new Date(refYear, 0, 1);
    const patterns = /^\\d{4}-\\d{2}-\\d{2}$/.test(s)
      ? ["yyyy-MM-dd"]
      : /^\\d{2}-\\d{2}-\\d{4}$/.test(s)
        ? ["dd-MM-yyyy"]
        : ["dd MMM"];

    for (const pattern of patterns) {
      try {
        const parsed = parse(s, pattern, reference, { locale: ptBR });
        if (!isNaN(parsed.getTime())) {
          return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
        }
      } catch {
        // Try the next supported format.
      }
    }
    return null;
  };

  const parseEditorTxDate = (s: string, refIso?: string): Date | undefined => {
    if (!s) return undefined;
    const refYear = refIso ? new Date(refIso).getFullYear() : new Date().getFullYear();
    const reference = new Date(refYear, 0, 1);
    const pattern = /^\\d{4}-\\d{2}-\\d{2}$/.test(s)
      ? "yyyy-MM-dd"
      : /^\\d{2}-\\d{2}-\\d{4}$/.test(s)
        ? "dd-MM-yyyy"
        : "dd MMM";
    try {
      const parsed = parse(s, pattern, reference, { locale: ptBR });
      return isNaN(parsed.getTime()) ? undefined : parsed;
    } catch {
      return undefined;
    }
  };

  const formatEditorTxDate = (s: string, refIso?: string) => {
    const parsed = parseEditorTxDate(s, refIso);
    return parsed ? format(parsed, "dd-MM-yyyy") : s;
  };
'''

if old_parser not in s:
    raise SystemExit('parseTxDate block not found')
s = s.replace(old_parser, new_parser, 1)

old_display = '''                      {editTx.date || "Selecionar data"}'''
new_display = '''                      {editTx.date ? formatEditorTxDate(editTx.date, editTx.created_at) : "Selecionar data"}'''
if old_display not in s:
    raise SystemExit('date display marker not found')
s = s.replace(old_display, new_display, 1)

old_calendar = '''                    <Calendar mode="single" selected={(() => { try { return parse(editTx.date, "dd MMM", new Date(), { locale: ptBR }); } catch { return undefined; } })()} onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />'''
new_calendar = '''                    <Calendar mode="single" selected={parseEditorTxDate(editTx.date, editTx.created_at)} onSelect={(date) => { if (date) setEditTx({ ...editTx, date: format(date, "dd MMM", { locale: ptBR }) }); }} initialFocus className={cn("p-3 pointer-events-auto")} />'''
if old_calendar not in s:
    raise SystemExit('calendar date marker not found')
s = s.replace(old_calendar, new_calendar, 1)

p.write_text(s)
