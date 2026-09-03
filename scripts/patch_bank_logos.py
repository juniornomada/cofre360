from pathlib import Path

p = Path('src/components/BankLogo.tsx')
s = p.read_text()
old = '  { id: "caixa", label: "Caixa Econômica", abbr: "CX", color: "from-blue-600 to-blue-900", textColor: "text-white", bgHex: "#005CA9", logoUrl: `${BANK_ICON_BASE}/caixa.svg`, aliases: ["caixa economica federal", "cef"] },\n'
new = '''  { id: "caixa", label: "Caixa Econômica Federal", abbr: "CX", color: "from-blue-600 to-blue-900", textColor: "text-white", bgHex: "#005CA9", logoUrl: `${BANK_ICON_BASE}/caixa.svg`, aliases: ["caixa econômica", "caixa economica", "caixa economica federal", "cef"] },\n  { id: "caixacacr", label: "Caixa CA CR", abbr: "CX", color: "from-blue-600 to-blue-900", textColor: "text-white", bgHex: "#005CA9", logoUrl: `${BANK_ICON_BASE}/caixa.svg`, aliases: ["caixa ca cr", "caixa alimentação", "caixa alimentacao", "caixa refeição", "caixa refeicao"] },\n  { id: "porto", label: "Porto Bank", abbr: "PB", color: "from-sky-400 to-blue-600", textColor: "text-white", bgHex: "#00A1FC", logoUrl: `${BANK_ICON_BASE}/porto.svg`, aliases: ["porto", "porto seguro", "banco porto", "porto bank"] },\n'''
if old not in s:
    raise SystemExit('target Caixa preset not found')
s = s.replace(old, new, 1)
p.write_text(s)
print('patched BankLogo.tsx')
