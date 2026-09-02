from pathlib import Path

path = Path('src/routes/accounts.tsx')
text = path.read_text()

old = 'import { formatSignedBRL } from "@/lib/format-brl";\n'
new = 'import { formatSignedBRL } from "@/lib/format-brl";\nimport { parseCategoryValue } from "@/lib/categories";\n'
if old not in text:
    raise SystemExit('import marker not found')
text = text.replace(old, new, 1)

old = '''  income: number;\n  expense: number;\n  deleteConfirm: string | null;'''
new = '''  income: number;\n  expense: number;\n  yieldAmount: number;\n  deleteConfirm: string | null;'''
if old not in text:
    raise SystemExit('props marker not found')
text = text.replace(old, new, 1)

old = '''  income,\n  expense,\n  deleteConfirm,'''
new = '''  income,\n  expense,\n  yieldAmount,\n  deleteConfirm,'''
if old not in text:
    raise SystemExit('destructure marker not found')
text = text.replace(old, new, 1)

old = '''  const openingBalance = Math.round(Number(account.balance || 0) * 100) / 100;\n  const currentBalance = Math.round((openingBalance + income - expense) * 100) / 100;\n  const performance = Math.round((currentBalance - openingBalance) * 100) / 100;\n  const performancePct = openingBalance !== 0 ? (performance / Math.abs(openingBalance)) * 100 : 0;'''
new = '''  const openingBalance = Math.round(Number(account.balance || 0) * 100) / 100;\n  const currentBalance = Math.round((openingBalance + income - expense) * 100) / 100;\n  // Rendimento financeiro não é variação de saldo. Aportes e resgates alteram\n  // o saldo da subconta, mas somente juros menos IR/IOF/taxas compõem rendimento.\n  const performance = Math.round(Number(yieldAmount || 0) * 100) / 100;\n  const investedPrincipal = Math.round((currentBalance - performance) * 100) / 100;\n  const performancePct = Math.abs(investedPrincipal) >= 0.005\n    ? (performance / Math.abs(investedPrincipal)) * 100\n    : 0;'''
if old not in text:
    raise SystemExit('performance block not found')
text = text.replace(old, new, 1)

old = '''  const [monthIncomeByAccount, setMonthIncomeByAccount] = useState<Record<string, number>>({});\n  const [monthExpenseByAccount, setMonthExpenseByAccount] = useState<Record<string, number>>({});'''
new = '''  const [monthIncomeByAccount, setMonthIncomeByAccount] = useState<Record<string, number>>({});\n  const [monthExpenseByAccount, setMonthExpenseByAccount] = useState<Record<string, number>>({});\n  const [monthYieldByAccount, setMonthYieldByAccount] = useState<Record<string, number>>({});'''
if old not in text:
    raise SystemExit('state marker not found')
text = text.replace(old, new, 1)

old = '.select("bank_account_id, amount, type, is_visible, card, date, created_at")'
new = '.select("bank_account_id, amount, type, is_visible, card, date, created_at, name, category")'
if old not in text:
    raise SystemExit('transaction select marker not found')
text = text.replace(old, new, 1)

old = '''        const monthIncMap: Record<string, number> = {};\n        const monthExpMap: Record<string, number> = {};\n        const today = new Date();'''
new = '''        const monthIncMap: Record<string, number> = {};\n        const monthExpMap: Record<string, number> = {};\n        const yieldCentsMap: Record<string, number> = {};\n        const today = new Date();'''
if old not in text:
    raise SystemExit('map marker not found')
text = text.replace(old, new, 1)

old = '''          // Mapas do mês servem apenas para exibição do saldo histórico selecionado.\n          if (!transactionDate || transactionDate <= selectedCutoff) {\n            if (tx.type === "income") monthIncMap[id] = (monthIncMap[id] || 0) + amt;\n            else monthExpMap[id] = (monthExpMap[id] || 0) + amt;\n          }'''
new = '''          // Mapas do mês servem apenas para exibição do saldo histórico selecionado.\n          if (!transactionDate || transactionDate <= selectedCutoff) {\n            if (tx.type === "income") monthIncMap[id] = (monthIncMap[id] || 0) + amt;\n            else monthExpMap[id] = (monthExpMap[id] || 0) + amt;\n\n            // Regra de rendimento da subconta:\n            //   juros/rendimentos - IR - IOF - taxas bancárias de resgate.\n            // Transferências (aporte/resgate) nunca entram aqui.\n            const parsedCategory = parseCategoryValue(String(tx.category || ""));\n            const normalizedName = String(tx.name || "")\n              .normalize("NFD")\n              .replace(/[\\u0300-\\u036f]/g, "")\n              .toLowerCase();\n            const amountCents = Math.round(amt * 100);\n            const isInterestIncome =\n              tx.type === "income" &&\n              parsedCategory.group === "Receita" &&\n              parsedCategory.sub === "Juros";\n            const isInvestmentFee =\n              tx.type === "expense" && (\n                (parsedCategory.group === "Impostos/Taxas" &&\n                  (parsedCategory.sub === "IR" || parsedCategory.sub === "Taxas Bancárias")) ||\n                /\\biof\\b/.test(normalizedName) ||\n                normalizedName.includes("imposto de renda")\n              );\n\n            if (isInterestIncome) {\n              yieldCentsMap[id] = (yieldCentsMap[id] || 0) + amountCents;\n            } else if (isInvestmentFee) {\n              yieldCentsMap[id] = (yieldCentsMap[id] || 0) - amountCents;\n            }\n          }'''
if old not in text:
    raise SystemExit('selected cutoff block not found')
text = text.replace(old, new, 1)

old = '''        setMonthIncomeByAccount(monthIncMap);\n        setMonthExpenseByAccount(monthExpMap);'''
new = '''        setMonthIncomeByAccount(monthIncMap);\n        setMonthExpenseByAccount(monthExpMap);\n        setMonthYieldByAccount(\n          Object.fromEntries(Object.entries(yieldCentsMap).map(([id, cents]) => [id, cents / 100])),\n        );'''
if old not in text:
    raise SystemExit('set maps marker not found')
text = text.replace(old, new, 1)

old = '''                    income={monthIncomeByAccount[account.id] || 0}\n                    expense={monthExpenseByAccount[account.id] || 0}\n                    deleteConfirm={deleteConfirm}'''
new = '''                    income={monthIncomeByAccount[account.id] || 0}\n                    expense={monthExpenseByAccount[account.id] || 0}\n                    yieldAmount={monthYieldByAccount[account.id] || 0}\n                    deleteConfirm={deleteConfirm}'''
if old not in text:
    raise SystemExit('render props marker not found')
text = text.replace(old, new, 1)

path.write_text(text)
