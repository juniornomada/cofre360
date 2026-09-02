from pathlib import Path

path = Path("src/components/QuickAddTransactionDialog.tsx")
text = path.read_text()
marker = '                  Conta Débito/Pix\n'
if marker not in text:
    raise SystemExit("Conta Débito/Pix section not found")

before, after = text.split(marker, 1)

badge = '''                          {a.parent_account_id && (\n                            <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-border bg-background px-0.5 text-[8px] font-black leading-none text-primary">↳</span>\n                          )}\n'''
subtitle = '''                        <span className={cn("w-full truncate text-center text-[7px] leading-tight", a.parent_account_id ? "font-semibold text-primary" : "text-muted-foreground")} title={accountHierarchyLabel(a)}>\n                          {a.parent_account_id ? `Sub · ${a.parent_name || "Principal"}` : "Conta principal"}\n                        </span>\n'''

if badge not in after:
    raise SystemExit("Debit/Pix hierarchy badge not found")
if subtitle not in after:
    raise SystemExit("Debit/Pix hierarchy subtitle not found")

after = after.replace(badge, "", 1)
after = after.replace(subtitle, "", 1)
path.write_text(before + marker + after)
print("Removed Debit/Pix hierarchy badge and subtitle")
