from pathlib import Path

# 1) Central yield rules
path = Path('src/lib/account-yield.ts')
text = path.read_text()
needle = '''export type AccountYieldComponent = "interest" | "fee";\n\nfunction normalizeLabel(value: string | null | undefined) {\n'''
replacement = '''export type AccountYieldComponent = "interest" | "fee";\n\nexport type YieldTransactionFields = {\n  type: "income" | "expense";\n  category: string;\n  icon: string;\n};\n\nfunction normalizeLabel(value: string | null | undefined) {\n'''
if needle not in text:
    raise SystemExit('account-yield type marker not found')
text = text.replace(needle, replacement, 1)

needle = '''export function classifyAccountYieldTransaction(\n'''
insert = '''export function inferYieldTransactionFields(\n  name: string | null | undefined,\n): YieldTransactionFields | null {\n  const normalizedName = normalizeLabel(name);\n\n  // Nomes inequívocos de rendimento: independentemente da aba/categoria que\n  // estiver selecionada, o lançamento deve ser tratado como juros.\n  if (/^(rendimentos?|juros?)(?:\\b|\\s|$)/.test(normalizedName)) {\n    return { type: "income", category: "Receita > Juros", icon: "📈" };\n  }\n\n  if (/\\biof\\b/.test(normalizedName)) {\n    return { type: "expense", category: "Impostos/Taxas > IOF", icon: "🏛️" };\n  }\n\n  if (/^(ir|imposto de renda)(?:\\b|\\s|$)/.test(normalizedName)) {\n    return { type: "expense", category: "Impostos/Taxas > IR", icon: "📊" };\n  }\n\n  if (normalizedName.includes("taxa") && (normalizedName.includes("resgate") || normalizedName.includes("cdb"))) {\n    return { type: "expense", category: "Impostos/Taxas > Taxas Bancárias", icon: "🏦" };\n  }\n\n  return null;\n}\n\nexport function classifyAccountYieldTransaction(\n'''
if needle not in text:
    raise SystemExit('classify marker not found')
text = text.replace(needle, insert, 1)

needle = '''      (parsedCategory.group === "Impostos/Taxas" &&\n        (parsedCategory.sub === "IR" || parsedCategory.sub === "Taxas Bancárias")) ||\n'''
replacement = '''      (parsedCategory.group === "Impostos/Taxas" &&\n        (parsedCategory.sub === "IR" || parsedCategory.sub === "IOF" || parsedCategory.sub === "Taxas Bancárias")) ||\n'''
if needle not in text:
    raise SystemExit('fee category marker not found')
text = text.replace(needle, replacement, 1)
path.write_text(text)

# 2) Expose IOF explicitly in category picker
path = Path('src/lib/categories.ts')
text = path.read_text()
needle = '''      { label: "IR", icon: "📊" },\n      { label: "INSS/FGTS", icon: "🏛️" },\n'''
replacement = '''      { label: "IR", icon: "📊" },\n      { label: "IOF", icon: "🏛️" },\n      { label: "INSS/FGTS", icon: "🏛️" },\n'''
if needle not in text:
    raise SystemExit('IR category marker not found')
text = text.replace(needle, replacement, 1)
path.write_text(text)

# 3) Quick Add: auto-correct type/category/icon as the name is typed or category is changed
path = Path('src/components/QuickAddTransactionDialog.tsx')
text = path.read_text()
needle = '''import { sanitizeTransactionWrite, sanitizeTransactionWrites } from "@/lib/normalize-transaction-name";\n'''
replacement = '''import { sanitizeTransactionWrite, sanitizeTransactionWrites } from "@/lib/normalize-transaction-name";\nimport { inferYieldTransactionFields } from "@/lib/account-yield";\n'''
if needle not in text:
    raise SystemExit('QuickAdd import marker not found')
text = text.replace(needle, replacement, 1)

needle = '''  const [installmentEnabled, setInstallmentEnabled] = useState(false);\n'''
insert = '''  useEffect(() => {\n    if (isTransfer || !newTx.name.trim()) return;\n    const inferred = inferYieldTransactionFields(newTx.name);\n    if (!inferred) return;\n    if (\n      newTx.type === inferred.type &&\n      newTx.category === inferred.category &&\n      newTx.icon === inferred.icon\n    ) return;\n    setNewTx(prev => ({ ...prev, ...inferred, card: inferred.type === "income" ? null : prev.card }));\n  }, [isTransfer, newTx.name, newTx.type, newTx.category, newTx.icon]);\n\n  const [installmentEnabled, setInstallmentEnabled] = useState(false);\n'''
if needle not in text:
    raise SystemExit('QuickAdd state marker not found')
text = text.replace(needle, insert, 1)
path.write_text(text)

# 4) Transaction editor: same safety rule on edits
path = Path('src/routes/transactions.tsx')
text = path.read_text()
needle = '''import { isAccountYieldComponent } from "@/lib/account-yield";\n'''
replacement = '''import { inferYieldTransactionFields, isAccountYieldComponent } from "@/lib/account-yield";\n'''
if needle not in text:
    raise SystemExit('transactions yield import marker not found')
text = text.replace(needle, replacement, 1)

needle = '''  const [showDeleteDialog, setShowDeleteDialog] = useState(false);\n'''
insert = '''  useEffect(() => {\n    if (!editTx || isTransferTransaction(editTx) || !editTx.name.trim()) return;\n    const inferred = inferYieldTransactionFields(editTx.name);\n    if (!inferred) return;\n    if (\n      editTx.type === inferred.type &&\n      editTx.category === inferred.category &&\n      editTx.icon === inferred.icon\n    ) return;\n    setEditTx(prev => prev ? ({\n      ...prev,\n      ...inferred,\n      card: inferred.type === "income" ? null : prev.card,\n    }) : prev);\n  }, [editTx?.name, editTx?.type, editTx?.category, editTx?.icon]);\n\n  const [showDeleteDialog, setShowDeleteDialog] = useState(false);\n'''
if needle not in text:
    raise SystemExit('transactions edit marker not found')
text = text.replace(needle, insert, 1)
path.write_text(text)

# 5) Accounts: show yield for principal accounts too. Opening balance stays child-only.
path = Path('src/routes/accounts.tsx')
text = path.read_text()
old = '''                {account.parent_account_id && openingBalance !== 0 && (\n                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">\n                    <span className="text-[11px] tabular-nums leading-tight text-muted-foreground">\n                      Saldo inicial: {balanceVisible ? formatSignedBRL(openingBalance) : "R$ ••••"}\n                    </span>\n                    <button\n                      type="button"\n                      onClick={(event) => {\n                        event.preventDefault();\n                        event.stopPropagation();\n                        window.location.assign(\n                          `/transactions?accountId=${encodeURIComponent(account.id)}&month=${encodeURIComponent(selectedMonthKey)}&yield=1`,\n                        );\n                      }}\n                      className={cn(\n                        "text-[11px] tabular-nums leading-tight font-medium text-left hover:underline underline-offset-2",\n                        performance > 0 ? "text-primary" : performance < 0 ? "text-destructive" : "text-muted-foreground"\n                      )}\n                      title="Ver composição do rendimento"\n                    >\n                      Rendimento: {balanceVisible\n                        ? `${formatSignedBRL(performance)} (${performancePct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`\n                        : "R$ ••••"}\n                    </button>\n                  </div>\n                )}\n'''
new = '''                {((account.parent_account_id && openingBalance !== 0) || Math.abs(performance) >= 0.005) && (\n                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">\n                    {account.parent_account_id && openingBalance !== 0 && (\n                      <span className="text-[11px] tabular-nums leading-tight text-muted-foreground">\n                        Saldo inicial: {balanceVisible ? formatSignedBRL(openingBalance) : "R$ ••••"}\n                      </span>\n                    )}\n                    {Math.abs(performance) >= 0.005 && (\n                      <button\n                        type="button"\n                        onClick={(event) => {\n                          event.preventDefault();\n                          event.stopPropagation();\n                          window.location.assign(\n                            `/transactions?accountId=${encodeURIComponent(account.id)}&month=${encodeURIComponent(selectedMonthKey)}&yield=1`,\n                          );\n                        }}\n                        className={cn(\n                          "text-[11px] tabular-nums leading-tight font-medium text-left hover:underline underline-offset-2",\n                          performance > 0 ? "text-primary" : performance < 0 ? "text-destructive" : "text-muted-foreground"\n                        )}\n                        title="Ver composição do rendimento"\n                      >\n                        Rendimento: {balanceVisible\n                          ? `${formatSignedBRL(performance)} (${performancePct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`\n                          : "R$ ••••"}\n                      </button>\n                    )}\n                  </div>\n                )}\n'''
if old not in text:
    raise SystemExit('accounts yield display block not found')
text = text.replace(old, new, 1)
path.write_text(text)
