from pathlib import Path

p = Path('src/routes/cards.tsx')
s = p.read_text()

old = '''                          <p
                            data-testid="invoice-transaction-name"
                            className="text-xs font-medium text-foreground min-w-0"
                          >
                            <AutoFitText titleFallback={normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}>
                              {normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}
                              {(tx.total_installments || 1) > 1 && (
                                <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                  ({tx.installment_number}/{tx.total_installments})
                                </span>
                              )}
                            </AutoFitText>
                          </p>
'''
new = '''                          <p
                            data-testid="invoice-transaction-name"
                            className="text-xs font-medium text-foreground min-w-0"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 flex-1">
                                <AutoFitText titleFallback={normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}>
                                  {normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}
                                </AutoFitText>
                              </span>
                              {(tx.total_installments || 1) > 1 && (
                                <span
                                  data-testid="invoice-installment-badge"
                                  className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums text-primary"
                                  aria-label={`Parcela ${tx.installment_number} de ${tx.total_installments}`}
                                  title={`Parcela ${tx.installment_number} de ${tx.total_installments}`}
                                >
                                  {tx.installment_number}/{tx.total_installments}
                                </span>
                              )}
                            </span>
                          </p>
'''

if old not in s:
    raise SystemExit('invoice transaction title anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

Path('src/tests/cards-invoice-installment-badge.test.ts').write_text('''import { describe, expect, it } from "vitest";\nimport { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\n\nconst source = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");\n\ndescribe("invoice installment badge", () => {\n  it("keeps installment progress visible outside the auto-fit transaction name", () => {\n    expect(source).toContain('data-testid="invoice-installment-badge"');\n    expect(source).toContain('{tx.installment_number}/{tx.total_installments}');\n    expect(source).toContain('aria-label={`Parcela ${tx.installment_number} de ${tx.total_installments}`}');\n  });\n});\n''')

print('invoice installment badge patch prepared')
