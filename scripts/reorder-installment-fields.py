from pathlib import Path

path = Path('src/components/QuickAddTransactionDialog.tsx')
text = path.read_text()
start_marker = '                      <div className="space-y-2.5">\n'
end_marker = '                      </div>\n                        <div className="space-y-1.5 rounded-md bg-primary/5 border border-primary/20 p-2">'
start = text.index(start_marker)
end = text.index(end_marker, start)
block = text[start:end + len('                      </div>\n')]

first_marker = '                        <div>\n                          <label className="text-[11px] font-semibold text-foreground mb-1 block">Total de parcelas</label>'
second_marker = '                        <div>\n                          <label className="text-[11px] font-semibold text-foreground mb-1 block">\n                            Parcela atual <span className="text-muted-foreground font-normal">(lançar a partir de)</span>'
first = block.index(first_marker)
second = block.index(second_marker)

# Locate the end of the first child block by using the second child's start.
prefix = block[:first]
first_child = block[first:second]
second_child = block[second:]

# second_child includes the parent closing div; split it off so only the two children swap.
parent_close = '                      </div>\n'
assert second_child.endswith(parent_close)
second_body = second_child[:-len(parent_close)]
new_block = prefix + second_body + first_child + parent_close

assert new_block != block
text = text[:start] + new_block + text[end + len('                      </div>\n'):]
path.write_text(text)

updated = path.read_text()
parcel_pos = updated.index('Parcela atual <span className="text-muted-foreground font-normal">(lançar a partir de)</span>')
total_pos = updated.index('>Total de parcelas</label>', parcel_pos - 500)
assert parcel_pos < total_pos
