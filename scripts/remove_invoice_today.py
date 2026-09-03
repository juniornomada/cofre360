from pathlib import Path

p = Path('src/routes/cards.tsx')
s = p.read_text()

old = '''                          {monthOffset !== 0 && (\n                            <button\n                              type="button"\n                              onClick={(e) => {\n                                e.stopPropagation();\n                                setMonthOffset(0);\n                              }}\n                              data-on-card="true"\n                              className="text-[9px] font-semibold text-white/80 hover:text-white underline underline-offset-2 ml-1"\n                              aria-label="Voltar para o vencimento atual"\n                            >\n                              hoje\n                            </button>\n                          )}\n'''

if old not in s:
    raise SystemExit('today button block not found')

s = s.replace(old, '', 1)
p.write_text(s)
print('removed invoice today button')
