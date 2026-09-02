from pathlib import Path

path = Path('src/routes/accounts.tsx')
text = path.read_text()

old = '''                {((account.parent_account_id && openingBalance !== 0) || Math.abs(performance) >= 0.005) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                    {account.parent_account_id && openingBalance !== 0 && (
                      <span className="text-[11px] tabular-nums leading-tight text-muted-foreground">
                        Saldo inicial: {balanceVisible ? formatSignedBRL(openingBalance) : "R$ ••••"}
                      </span>
                    )}
                    {Math.abs(performance) >= 0.005 && (
'''
new = '''                {Math.abs(performance) >= 0.005 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                    {account.parent_account_id && (
                      <span className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] tabular-nums tracking-tight leading-tight text-muted-foreground">
                        Investido: {balanceVisible ? formatSignedBRL(investedPrincipal) : "R$ ••••"}
                      </span>
                    )}
                    {Math.abs(performance) >= 0.005 && (
'''

if old not in text:
    raise SystemExit('target account summary block not found')

text = text.replace(old, new, 1)
path.write_text(text)
