from pathlib import Path
p=Path('src/routes/cards.tsx')
s=p.read_text()
old_start='''      {/* Edit Dialog */}\n      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>\n        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm mx-auto rounded-2xl p-4 sm:p-6 flex flex-col gap-4">\n          <DialogHeader className="pr-6">\n            <DialogTitle className="text-sm">Editar Transação</DialogTitle>\n          </DialogHeader>\n          {editTx && (\n            <div className="flex flex-col gap-4">'''
new_start='''      {/* Edit Dialog */}\n      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>\n        <DialogContent\n          data-testid="invoice-edit-dialog"\n          className="max-w-[calc(100vw-1rem)] sm:max-w-sm mx-auto rounded-2xl p-3 sm:p-6 flex max-h-[calc(100dvh-1rem)] flex-col gap-2 sm:gap-4 overflow-y-auto overscroll-contain"\n        >\n          <DialogHeader className="pr-6">\n            <DialogTitle className="text-sm">Editar Transação</DialogTitle>\n          </DialogHeader>\n          {editTx && (\n            <div className="flex flex-col gap-3 sm:gap-4">'''
if old_start not in s: raise SystemExit('edit dialog start not found')
s=s.replace(old_start,new_start,1)
s=s.replace('<div className="min-h-[60px]">','<div className="min-h-[52px] sm:min-h-[60px]">',1)
old='''              <div>\n                <Label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</Label>\n                <CalculatorAmountInput\n                  value={editTx.amount}\n                  onChange={(v) => setEditTx({ ...editTx, amount: v })}\n                />\n              </div>'''
new='''              <div\n                data-testid="invoice-edit-amount"\n                onFocusCapture={(event) => {\n                  const field = event.currentTarget;\n                  window.setTimeout(() => field.scrollIntoView({ behavior: "smooth", block: "center" }), 180);\n                }}\n              >\n                <Label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</Label>\n                <CalculatorAmountInput\n                  value={editTx.amount}\n                  onChange={(v) => setEditTx({ ...editTx, amount: v })}\n                />\n              </div>'''
if old not in s: raise SystemExit('amount block not found')
s=s.replace(old,new,1)
s=s.replace('className="w-full rounded-2xl py-6 font-semibold mt-2"','className="w-full rounded-2xl py-4 sm:py-6 font-semibold mt-0 sm:mt-2"',1)
p.write_text(s)
print('patched')
