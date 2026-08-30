from pathlib import Path

p = Path("src/routes/accounts.tsx")
s = p.read_text()

react_import = 'import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";\n'
date_imports = 'import { format } from "date-fns";\nimport { ptBR } from "date-fns/locale";\n'

if date_imports not in s:
    if react_import not in s:
        raise SystemExit("React import marker not found")
    s = s.replace(react_import, react_import + date_imports, 1)

old = 'date: new Date().toLocaleDateString("en-CA"),'
count = s.count(old)
if count < 2:
    raise SystemExit(f"Expected at least 2 adjustment date occurrences, found {count}")

s = s.replace(old, 'date: format(new Date(), "dd MMM", { locale: ptBR }),')
p.write_text(s)

check = p.read_text()
if old in check:
    raise SystemExit("Legacy adjustment date format still present")
if check.count('date: format(new Date(), "dd MMM", { locale: ptBR }),') < 2:
    raise SystemExit("New adjustment date format not applied to both flows")

print(f"Updated {count} automatic adjustment date writes")
