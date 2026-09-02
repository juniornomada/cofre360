from pathlib import Path

path = Path("src/routes/home.tsx")
text = path.read_text()
old = '''      const rawCategory = (tx.category || "Sem categoria").trim();\n      const mainCategory = rawCategory.split(" > ")[0]?.trim() || "Sem categoria";\n      totalsInCents[mainCategory] = addCurrencyCents(totalsInCents[mainCategory] || 0, tx.amount);\n'''
new = '''      const rawCategory = (tx.category || "Sem categoria").trim();\n      const mainCategory = rawCategory.split(" > ")[0]?.trim() || "Sem categoria";\n      if (mainCategory === "Transferência" || mainCategory === "Transferências") continue;\n      totalsInCents[mainCategory] = addCurrencyCents(totalsInCents[mainCategory] || 0, tx.amount);\n'''
if old not in text:
    raise SystemExit("Home category spending block not found")
path.write_text(text.replace(old, new, 1))
print("Transfers excluded from Home monthly spending chart")
