from pathlib import Path

p = Path('src/components/QuickAddTransactionDialog.tsx')
text = p.read_text()

old = '''        const fromAcc = bankAccounts.find(a => a.id === transferFromId);\n        if (fromAcc && (fromAcc.balance || 0) < newTx.amount) {\n          toast.error(`Saldo insuficiente na conta ${fromAcc.name}. Saldo disponível: R$ ${(fromAcc.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);\n          setIsSubmitting(false);\n          return;\n        }\n\n        const toAcc = bankAccounts.find(a => a.id === transferToId);'''
new = '''        const fromAcc = bankAccounts.find(a => a.id === transferFromId);\n        // Transfers may intentionally leave the source account with a negative balance.\n        // This is a tracking app, so balance reconciliation can happen later.\n        const toAcc = bankAccounts.find(a => a.id === transferToId);'''

if old not in text:
    raise SystemExit('transfer balance validation block not found')

text = text.replace(old, new, 1)
p.write_text(text)
print('removed transfer balance limit')
