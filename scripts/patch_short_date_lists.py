from pathlib import Path
import re

# Home: short visual date DD MMM, uppercase; storage/parsing remains full-compatible.
p = Path('src/routes/home.tsx')
s = p.read_text()
pattern = re.compile(r'function formatDisplayDate\(value: string \| null, refIso\?: string \| null\) \{.*?\n\}\n\nfunction RecoveredHome', re.S)
replacement = '''function formatDisplayDate(value: string | null, refIso?: string | null) {
  const parsed = safeDate(value, refIso);
  if (!parsed) return value || "";
  const dd = String(parsed.getDate()).padStart(2, "0");
  const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  return `${dd} ${months[parsed.getMonth()]}`;
}

function RecoveredHome'''
s, count = pattern.subn(lambda _: replacement, s, count=1)
if count != 1:
    raise SystemExit(f'home formatDisplayDate replacement count={count}')
p.write_text(s)

# Transaction list: same short visual date DD MMM, uppercase.
p = Path('src/components/TransactionItem.tsx')
s = p.read_text()
pattern = re.compile(r'function formatTxDate\(date: string, refIso\?: string\): string \{.*?\n\}\n\ninterface TransactionItemProps', re.S)
replacement = '''function formatTxDate(date: string, _refIso?: string): string {
  const trimmed = date.trim().toLowerCase();

  const iso = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (iso) {
    const month = Number(iso[2]) - 1;
    if (month >= 0 && month < 12) return `${iso[3]} ${MONTHS_PT_ABBR[month].toUpperCase()}`;
  }

  const dmy = trimmed.match(/^(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{4}))?$/);
  if (dmy) {
    const month = Number(dmy[2]) - 1;
    if (month >= 0 && month < 12) return `${dmy[1].padStart(2, "0")} ${MONTHS_PT_ABBR[month].toUpperCase()}`;
  }

  const compact = trimmed.match(/^(\\d{1,2})\\s+([a-zç]{3})(?:\\s+(\\d{4}))?$/i);
  if (compact) {
    const month = MONTHS_PT_ABBR.indexOf(compact[2]);
    if (month >= 0) return `${compact[1].padStart(2, "0")} ${MONTHS_PT_ABBR[month].toUpperCase()}`;
  }
  return date;
}

interface TransactionItemProps'''
s, count = pattern.subn(lambda _: replacement, s, count=1)
if count != 1:
    raise SystemExit(f'TransactionItem formatTxDate replacement count={count}')
p.write_text(s)

# Quick add: creation/editing entry field uses full DD-MM-YYYY.
p = Path('src/components/QuickAddTransactionDialog.tsx')
s = p.read_text()

s = s.replace('/** Pré-seleciona a data em formato "dd MMM" (pt-BR). Fallback: hoje. */', '/** Pré-seleciona a data. Exibição canônica: "dd-MM-yyyy"; formatos legados também são aceitos. */')

marker = '''interface NewTx {
  icon: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  card: string | null;
  bank_account_id: string | null;
}

'''
helper = '''interface NewTx {
  icon: string;
  name: string;
  category: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  card: string | null;
  bank_account_id: string | null;
}

const parseQuickAddDate = (value: string): Date | undefined => {
  if (!value) return undefined;
  const reference = new Date();
  const patterns = /^\\d{4}-\\d{2}-\\d{2}$/.test(value)
    ? ["yyyy-MM-dd"]
    : /^\\d{1,2}-\\d{1,2}-\\d{4}$/.test(value)
      ? ["dd-MM-yyyy"]
      : ["dd MMM"];
  for (const pattern of patterns) {
    try {
      const parsed = parse(value, pattern, reference, { locale: ptBR });
      if (!isNaN(parsed.getTime())) return parsed;
    } catch {
      // Accept legacy date formats while keeping the canonical display below.
    }
  }
  return undefined;
};

const formatQuickAddDate = (date: Date) => format(date, "dd-MM-yyyy");
const normalizeQuickAddDate = (value?: string) => {
  if (!value) return formatQuickAddDate(new Date());
  const parsed = parseQuickAddDate(value);
  return parsed ? formatQuickAddDate(parsed) : value;
};

'''
if marker not in s:
    raise SystemExit('QuickAdd NewTx marker not found')
s = s.replace(marker, helper, 1)

repls = [
    ('const todayFormatted = format(new Date(), "dd MMM", { locale: ptBR });', 'const todayFormatted = formatQuickAddDate(new Date());'),
    ('date: initialDate || todayFormatted,', 'date: normalizeQuickAddDate(initialDate) || todayFormatted,'),
    ('date: format(new Date(), "dd MMM", { locale: ptBR }),', 'date: normalizeQuickAddDate(initialDate),'),
    ('baseDate = parse(newTx.date, "dd MMM", new Date(), { locale: ptBR });', 'baseDate = parseQuickAddDate(newTx.date) || new Date();'),
    ('date: format(installDate, "dd MMM", { locale: ptBR }),', 'date: formatQuickAddDate(installDate),'),
    ('parse(newTx.date, "dd MMM", new Date(), { locale: ptBR })', 'parseQuickAddDate(newTx.date)'),
    ('format(date, "dd MMM", { locale: ptBR })', 'formatQuickAddDate(date)'),
]
for old, new in repls:
    if old not in s:
        raise SystemExit(f'QuickAdd marker not found: {old}')
    s = s.replace(old, new)

# initialDate affects the date shown when the dialog is reopened for a specific date.
old_deps = '}, [open, initialType, fetchData, fetchHistory]);'
new_deps = '}, [open, initialType, initialDate, fetchData, fetchHistory]);'
if old_deps in s:
    s = s.replace(old_deps, new_deps, 1)

p.write_text(s)
print('short date list patch ready')
