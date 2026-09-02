from pathlib import Path

categories = Path('src/lib/categories.ts')
text = categories.read_text()
text = text.replace('{ label: "IR", icon: "📊" },', '{ label: "IR/IOF", icon: "📊" },')
old = '''export function parseCategoryValue(value: string): { group: string; sub: string } {\n  const parts = value.split(" > ");\n  if (parts.length === 2) return { group: parts[0], sub: parts[1] };\n'''
new = '''export function parseCategoryValue(value: string): { group: string; sub: string } {\n  // Compatibilidade com lançamentos antigos: a antiga categoria IR passou a\n  // representar o desconto combinado de IR/IOF quando o banco não discrimina.\n  if (value === "Impostos/Taxas > IR") {\n    return { group: "Impostos/Taxas", sub: "IR/IOF" };\n  }\n\n  const parts = value.split(" > ");\n  if (parts.length === 2) return { group: parts[0], sub: parts[1] };\n'''
if old not in text:
    raise SystemExit('parseCategoryValue anchor not found')
text = text.replace(old, new)
categories.write_text(text)

yield_file = Path('src/lib/account-yield.ts')
text = yield_file.read_text()
text = text.replace('return { type: "expense", category: "Impostos/Taxas > IR", icon: "📊" };', 'return { type: "expense", category: "Impostos/Taxas > IR/IOF", icon: "📊" };')
old = '''  if (normalizedName.includes("taxa") && (normalizedName.includes("resgate") || normalizedName.includes("cdb"))) {\n    return { type: "expense", category: "Impostos/Taxas > Taxas Bancárias", icon: "🏦" };\n  }\n'''
new = '''  if (\n    normalizedName.includes("ir/iof") ||\n    normalizedName.includes("ir e iof") ||\n    (normalizedName.includes("taxa") && (normalizedName.includes("resgate") || normalizedName.includes("cdb")))\n  ) {\n    return { type: "expense", category: "Impostos/Taxas > IR/IOF", icon: "📊" };\n  }\n'''
if old not in text:
    raise SystemExit('resgate rule anchor not found')
text = text.replace(old, new)
text = text.replace('(parsedCategory.sub === "IR" || parsedCategory.sub === "IOF" || parsedCategory.sub === "Taxas Bancárias")', '(parsedCategory.sub === "IR/IOF" || parsedCategory.sub === "IR" || parsedCategory.sub === "IOF" || parsedCategory.sub === "Taxas Bancárias")')
yield_file.write_text(text)
