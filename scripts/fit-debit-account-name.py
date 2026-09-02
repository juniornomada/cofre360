from pathlib import Path

path = Path("src/components/QuickAddTransactionDialog.tsx")
text = path.read_text()
marker = '                  Conta Débito/Pix\n'
if marker not in text:
    raise SystemExit("Conta Débito/Pix section not found")

before, after = text.split(marker, 1)
old = '<span className="text-[9px] font-medium text-foreground truncate w-full text-center leading-tight">{a.name}</span>'
new = '<span className={cn("font-medium text-foreground truncate w-full text-center leading-tight", a.name.length > 13 ? "text-[8px] tracking-tight" : "text-[9px]")}>{a.name}</span>'
if old not in after:
    raise SystemExit("Debit/Pix account name label not found")
after = after.replace(old, new, 1)
path.write_text(before + marker + after)
print("Adjusted long Debit/Pix account names")
