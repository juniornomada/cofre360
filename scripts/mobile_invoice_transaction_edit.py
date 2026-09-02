from pathlib import Path

path = Path("src/routes/cards.tsx")
s = path.read_text()

old = '''                        <div className="flex items-center gap-2 group/card-tx-row relative">
                          <span className="text-xs font-semibold text-destructive tabular-nums shrink-0">
                            -R$ {Number(tx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover/card-tx-row:opacity-100 transition-all duration-200 translate-x-2 group-hover/card-tx-row:translate-x-0">
                            <button
                              onClick={() => handleEditTx(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTx(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openInstallmentDialog(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar parcelamento"
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
'''

new = '''                        <div className="flex items-center gap-1.5 group/card-tx-row relative shrink-0">
                          <span className="text-xs font-semibold text-destructive tabular-nums shrink-0">
                            -R$ {Number(tx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>

                          {/* Mobile/touch: edição direta sempre visível. */}
                          <button
                            type="button"
                            onClick={() => handleEditTx(tx)}
                            className="sm:hidden flex h-8 w-8 items-center justify-center rounded-full bg-accent text-muted-foreground active:bg-accent/80 active:text-foreground"
                            title="Editar transação"
                            aria-label={`Editar ${normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {/* Mobile/touch: mantém exclusão e parcelamento acessíveis sem poluir a linha. */}
                          <div className="sm:hidden">
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/70 text-muted-foreground active:bg-accent active:text-foreground"
                                  title="Mais ações"
                                  aria-label={`Mais ações para ${normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}`}
                                >
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="z-[120] rounded-xl">
                                <DropdownMenuItem onClick={() => openInstallmentDialog(tx)} className="cursor-pointer">
                                  <Layers className="mr-2 h-4 w-4" />
                                  Editar parcelamento
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDeleteTx(tx)} className="cursor-pointer text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir transação
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Desktop: mantém os atalhos compactos no hover. */}
                          <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover/card-tx-row:opacity-100 transition-all duration-200 translate-x-2 group-hover/card-tx-row:translate-x-0">
                            <button
                              type="button"
                              onClick={() => handleEditTx(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar"
                              aria-label="Editar transação"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTx(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="Excluir"
                              aria-label="Excluir transação"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openInstallmentDialog(tx)}
                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar parcelamento"
                              aria-label="Editar parcelamento"
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
'''

if old not in s:
    if 'Mobile/touch: edição direta sempre visível.' in s:
        print('already patched')
    else:
        raise SystemExit('invoice transaction action block not found')
else:
    s = s.replace(old, new, 1)
    path.write_text(s)
    print('patched cards invoice transaction actions')
