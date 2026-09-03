from pathlib import Path

cards_path = Path('src/routes/cards.tsx')
s = cards_path.read_text()

old_import = 'import { sortInvoiceChronoAsc } from "@/lib/invoice-chrono-sort";\n'
new_import = old_import + 'import { getInvoicePaymentStatus, remainingInvoiceAmount } from "@/lib/invoice-payment-status";\n'
if old_import not in s:
    raise SystemExit('import anchor not found')
s = s.replace(old_import, new_import, 1)

old = 'const selRemaining = Math.max(0, selTotal - selPaid);'
new = 'const selRemaining = remainingInvoiceAmount(selTotal, selPaid);'
if old not in s:
    raise SystemExit('selRemaining anchor not found')
s = s.replace(old, new, 1)

old = '''                    const paidThisPeriod = selPaid;\n                    const remainingThisPeriod = selRemaining;\n                    const isFullyPaid = selTotal > 0 && remainingThisPeriod === 0;\n                    const isPartiallyPaid = paidThisPeriod > 0 && remainingThisPeriod > 0;\n                    const isOpen = selTotal > 0 && paidThisPeriod === 0;\n                    const isEmpty = selTotal === 0;'''
new = '''                    const paidThisPeriod = selPaid;\n                    const remainingThisPeriod = selRemaining;\n                    const paymentStatus = getInvoicePaymentStatus(selTotal, paidThisPeriod);\n                    const isFullyPaid = paymentStatus === "total";\n                    const isPartiallyPaid = paymentStatus === "partial";\n                    const isOpen = paymentStatus === "open";\n                    const isEmpty = paymentStatus === "empty";'''
if old not in s:
    raise SystemExit('status block anchor not found')
s = s.replace(old, new, 1)

old = '''                        const totalInvoice = activePeriod?.total || 0;\n                        \n                        if (totalPaid > 0 && totalPaid < totalInvoice) {'''
new = '''                        const totalInvoice = activePeriod?.total || 0;\n                        const paymentStatus = getInvoicePaymentStatus(totalInvoice, totalPaid);\n                        \n                        if (paymentStatus === "partial") {'''
if old not in s:
    raise SystemExit('payment dialog partial anchor not found')
s = s.replace(old, new, 1)

old = '} else if (totalPaid >= totalInvoice && totalInvoice > 0) {'
new = '} else if (paymentStatus === "total") {'
if old not in s:
    raise SystemExit('payment dialog total anchor not found')
s = s.replace(old, new, 1)

old = 'const remaining = Math.max(0, currentInvoiceTotal - paidInThisPeriod);'
new = 'const remaining = remainingInvoiceAmount(currentInvoiceTotal, paidInThisPeriod);'
if old not in s:
    raise SystemExit('payment remaining anchor not found')
s = s.replace(old, new, 1)

old = 'const remainingBeforeThis = Math.max(0, totalInvoice - paidInThisPeriod);'
new = 'const remainingBeforeThis = remainingInvoiceAmount(totalInvoice, paidInThisPeriod);'
if old not in s:
    raise SystemExit('remainingBeforeThis anchor not found')
s = s.replace(old, new, 1)

cards_path.write_text(s)

helper = Path('src/lib/invoice-payment-status.ts')
helper.write_text('''export type InvoicePaymentStatus = "empty" | "open" | "partial" | "total";\n\nexport function moneyToCents(value: number): number {\n  const safe = Number.isFinite(value) ? value : 0;\n  return Math.round(safe * 100);\n}\n\nexport function remainingInvoiceAmount(total: number, paid: number): number {\n  const remainingCents = Math.max(0, moneyToCents(total) - moneyToCents(paid));\n  return remainingCents / 100;\n}\n\nexport function getInvoicePaymentStatus(total: number, paid: number): InvoicePaymentStatus {\n  const totalCents = moneyToCents(total);\n  const paidCents = moneyToCents(paid);\n\n  if (totalCents <= 0) return "empty";\n  if (paidCents <= 0) return "open";\n  if (paidCents >= totalCents) return "total";\n  return "partial";\n}\n''')

test = Path('src/tests/invoice-payment-status.test.ts')
test.write_text('''import { describe, expect, it } from "bun:test";\nimport { getInvoicePaymentStatus, remainingInvoiceAmount } from "@/lib/invoice-payment-status";\n\ndescribe("invoice payment status", () => {\n  it("treats the Porto invoice as fully paid despite floating point residue", () => {\n    const total = 3491.53;\n    const paid = 1458 + 2033.53;\n\n    expect(total - paid).toBeGreaterThan(0);\n    expect(remainingInvoiceAmount(total, paid)).toBe(0);\n    expect(getInvoicePaymentStatus(total, paid)).toBe("total");\n  });\n\n  it("keeps genuinely partial invoices as partial", () => {\n    expect(remainingInvoiceAmount(3491.53, 1458)).toBe(2033.53);\n    expect(getInvoicePaymentStatus(3491.53, 1458)).toBe("partial");\n  });\n});\n''')
