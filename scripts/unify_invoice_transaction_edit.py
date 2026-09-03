from pathlib import Path

p = Path('src/routes/cards.tsx')
s = p.read_text()

# 1) Initialize installment fields whenever the transaction editor opens.
old = '''  const handleEditTx = (tx: CardTransaction) => {\n    setEditOriginalTx({ ...tx });\n    setEditTx({ ...tx });\n    setEditScopeDialogOpen(false);\n    setShowEditDialog(true);\n  };'''
new = '''  const handleEditTx = (tx: CardTransaction) => {\n    setEditOriginalTx({ ...tx });\n    setEditTx({ ...tx });\n    setInstallmentCurrent(String(Math.max(1, Number(tx.installment_number) || 1)));\n    setInstallmentTotal(String(Math.max(1, Number(tx.total_installments) || 1)));\n    setEditScopeDialogOpen(false);\n    setShowEditDialog(true);\n  };'''
assert old in s, 'handleEditTx anchor not found'
s = s.replace(old, new, 1)

# 2) Replace save logic so installment numbering/total can be edited from the same editor.
start = s.index('  const performSaveEditTx = async (scope: "single" | "future") => {')
end = s.index('\n  const handleDeleteTx = (tx: CardTransaction) => {', start)
replacement = r'''  const performSaveEditTx = async (scope: "single" | "future") => {
    if (!editTx || !editOriginalTx) return;

    const requestedCurrent = parseInt(installmentCurrent, 10);
    const requestedTotal = parseInt(installmentTotal, 10);
    if (
      !Number.isFinite(requestedCurrent) ||
      !Number.isFinite(requestedTotal) ||
      requestedCurrent < 1 ||
      requestedTotal < 1 ||
      requestedCurrent > requestedTotal ||
      requestedTotal > 48
    ) {
      toast.error("Parcelas inválidas");
      return;
    }

    setIsSavingEdit(true);
    try {
      const originalCurrent = Math.max(1, Number(editOriginalTx.installment_number) || 1);
      const originalTotal = Math.max(1, Number(editOriginalTx.total_installments) || 1);
      const installmentChanged = requestedCurrent !== originalCurrent || requestedTotal !== originalTotal;
      const baseName = stripInstallmentSuffix(editTx.name);
      const sharedUpdate = {
        name: baseName,
        category: editTx.category,
        icon: editTx.icon,
        amount: editTx.amount,
      };

      if (installmentChanged) {
        if (requestedTotal === 1) {
          // Converte a parcela selecionada em compra única. As demais parcelas
          // do grupo são preservadas para evitar exclusão implícita de dados.
          const { error } = await supabase
            .from("transactions")
            .update({
              ...sharedUpdate,
              date: editTx.date,
              installment_number: 1,
              total_installments: 1,
              installment_group_id: null,
            })
            .eq("id", editTx.id);
          if (error) throw error;
        } else {
          const groupId =
            editOriginalTx.installment_group_id ||
            (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

          let groupRows: CardTransaction[] = [];
          if (editOriginalTx.installment_group_id) {
            const { data, error } = await supabase
              .from("transactions")
              .select("id, name, icon, category, date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
              .eq("installment_group_id", editOriginalTx.installment_group_id)
              .order("installment_number", { ascending: true });
            if (error) throw error;
            groupRows = (data as CardTransaction[]) || [];
          } else {
            groupRows = [{ ...editOriginalTx }];
          }

          const previousRows = groupRows.filter(
            (row) => Math.max(1, Number(row.installment_number) || 1) < originalCurrent,
          );
          const affectedRows = groupRows.filter(
            (row) => Math.max(1, Number(row.installment_number) || 1) >= originalCurrent,
          );

          // Se o total mudou, parcelas anteriores também precisam exibir o novo total.
          if (requestedTotal !== originalTotal && previousRows.length > 0) {
            const previousResults = await Promise.all(
              previousRows.map((row) =>
                supabase
                  .from("transactions")
                  .update({ total_installments: requestedTotal })
                  .eq("id", row.id),
              ),
            );
            const previousFailure = previousResults.find((result) => result.error);
            if (previousFailure?.error) throw previousFailure.error;
          }

          const desiredCount = requestedTotal - requestedCurrent + 1;
          for (let index = 0; index < desiredCount; index++) {
            const installmentNumber = requestedCurrent + index;
            const existing = affectedRows[index];
            const shouldPropagateContent = scope === "future" || index === 0;
            const contentUpdate = existing && !shouldPropagateContent
              ? {
                  name: stripInstallmentSuffix(existing.name),
                  category: existing.category,
                  icon: existing.icon,
                  amount: existing.amount,
                }
              : sharedUpdate;
            const payload = {
              ...contentUpdate,
              date: addMonthsIso(editTx.date, index),
              installment_number: installmentNumber,
              total_installments: requestedTotal,
              installment_group_id: groupId,
            };

            if (existing) {
              const { error } = await supabase
                .from("transactions")
                .update(payload)
                .eq("id", existing.id);
              if (error) throw error;
            } else {
              const { error } = await supabase.from("transactions").insert(
                sanitizeTransactionWrite({
                  ...payload,
                  type: editTx.type,
                  card: editTx.card || invoiceCard?.name || null,
                }),
              );
              if (error) throw error;
            }
          }

          // Ao reduzir o total, remove somente parcelas futuras que ficaram fora
          // da nova sequência. As parcelas anteriores à editada nunca são apagadas.
          const extraRows = affectedRows.slice(desiredCount);
          if (extraRows.length > 0) {
            const deleteResults = await Promise.all(
              extraRows.map((row) => supabase.from("transactions").delete().eq("id", row.id)),
            );
            const deleteFailure = deleteResults.find((result) => result.error);
            if (deleteFailure?.error) throw deleteFailure.error;
          }
        }

        toast.success(
          scope === "future"
            ? "Parcelamento e parcelas futuras atualizados"
            : "Parcelamento atualizado",
        );
      } else if (scope === "future" && editTx.installment_group_id) {
        const current = Math.max(1, Number(editTx.installment_number) || 1);
        const { data: siblings, error: siblingsError } = await supabase
          .from("transactions")
          .select("id, installment_number")
          .eq("installment_group_id", editTx.installment_group_id)
          .gte("installment_number", current)
          .order("installment_number", { ascending: true });
        if (siblingsError) throw siblingsError;

        const dateChanged = editOriginalTx.date !== editTx.date;
        const results = await Promise.all((siblings || []).map((row) => {
          const n = Math.max(current, Number(row.installment_number) || current);
          const update: Record<string, unknown> = { ...sharedUpdate };
          if (row.id === editTx.id) update.date = editTx.date;
          else if (dateChanged) update.date = addMonthsIso(editTx.date, n - current);
          return supabase.from("transactions").update(update).eq("id", row.id);
        }));
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
        toast.success("Esta parcela e as futuras foram atualizadas");
      } else {
        const { error } = await supabase
          .from("transactions")
          .update({ ...sharedUpdate, date: editTx.date })
          .eq("id", editTx.id);
        if (error) throw error;
        toast.success("Parcela atualizada");
      }

      setEditScopeDialogOpen(false);
      setShowEditDialog(false);
      setEditOriginalTx(null);
      if (invoiceCard) await refreshInvoiceSilently(invoiceCard);
      else await fetchAll();
    } catch (error: any) {
      console.error("Error updating transaction:", error);
      toast.error("Erro ao atualizar transação");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const saveEditTx = async () => {
    if (!editTx || !editOriginalTx) return;
    const requestedCurrent = parseInt(installmentCurrent, 10);
    const requestedTotal = parseInt(installmentTotal, 10);
    if (
      !Number.isFinite(requestedCurrent) ||
      !Number.isFinite(requestedTotal) ||
      requestedCurrent < 1 ||
      requestedTotal < 1 ||
      requestedCurrent > requestedTotal ||
      requestedTotal > 48
    ) {
      toast.error("Parcelas inválidas");
      return;
    }

    const originalCurrent = Math.max(1, Number(editOriginalTx.installment_number) || 1);
    const originalTotal = Math.max(1, Number(editOriginalTx.total_installments) || 1);
    const hasFutureImpact =
      (editTx.installment_group_id && originalCurrent < originalTotal) ||
      requestedCurrent < requestedTotal;

    if (hasFutureImpact) {
      setEditScopeDialogOpen(true);
      return;
    }
    await performSaveEditTx("single");
  };
'''
s = s[:start] + replacement + s[end:]

# 3) Add installment controls directly inside Edit Transaction, before amount.
anchor = '''              <div\n                data-testid="invoice-edit-amount"'''
assert anchor in s, 'edit amount anchor not found'
installment_ui = '''              <div data-testid="invoice-edit-installment" className="rounded-xl border border-border/50 bg-accent/20 p-2.5">\n                <div className="mb-2 flex items-center justify-between gap-2">\n                  <Label className="text-xs font-semibold text-foreground">Parcelamento</Label>\n                  <span className="text-[10px] text-muted-foreground">Edite aqui sem sair da transação</span>\n                </div>\n                <div className="grid grid-cols-2 gap-2.5">\n                  <div className="space-y-1">\n                    <Label className="text-[10px] text-muted-foreground">Parcela atual</Label>\n                    <Input\n                      aria-label="Parcela atual"\n                      type="number"\n                      inputMode="numeric"\n                      min={1}\n                      max={48}\n                      value={installmentCurrent}\n                      onChange={(e) => setInstallmentCurrent(e.target.value.replace(/\\D/g, "").slice(0, 2))}\n                      className="h-9 rounded-xl text-center tabular-nums"\n                    />\n                  </div>\n                  <div className="space-y-1">\n                    <Label className="text-[10px] text-muted-foreground">Total de parcelas</Label>\n                    <Input\n                      aria-label="Total de parcelas"\n                      type="number"\n                      inputMode="numeric"\n                      min={1}\n                      max={48}\n                      value={installmentTotal}\n                      onChange={(e) => {\n                        const next = e.target.value.replace(/\\D/g, "").slice(0, 2);\n                        setInstallmentTotal(next);\n                        const max = parseInt(next, 10);\n                        const current = parseInt(installmentCurrent, 10);\n                        if (Number.isFinite(max) && Number.isFinite(current) && current > max) {\n                          setInstallmentCurrent(String(max));\n                        }\n                      }}\n                      className="h-9 rounded-xl text-center tabular-nums"\n                    />\n                  </div>\n                </div>\n              </div>\n\n'''
s = s.replace(anchor, installment_ui + anchor, 1)

# 4) Update scope explanation to reflect editable installment values.
old = '''                  Esta compra está na parcela <strong>{editTx.installment_number}/{editTx.total_installments}</strong>.\n                  Escolha se a correção vale somente para esta parcela ou também para as próximas.'''
new = '''                  Esta compra está sendo editada como parcela <strong>{installmentCurrent}/{installmentTotal}</strong>.\n                  Escolha se as alterações de valor, nome e categoria valem somente para esta parcela ou também para as próximas.\n                  Alterações na numeração do parcelamento mantêm a sequência futura coerente.'''
assert old in s, 'scope text anchor not found'
s = s.replace(old, new, 1)

# 5) Remove the separate installment action from mobile dropdown.
mobile = '''                                <DropdownMenuItem onClick={() => openInstallmentDialog(tx)} className="cursor-pointer">\n                                  <Layers className="mr-2 h-4 w-4" />\n                                  Editar parcelamento\n                                </DropdownMenuItem>\n                                <DropdownMenuSeparator />\n'''
assert mobile in s, 'mobile installment menu anchor not found'
s = s.replace(mobile, '', 1)
s = s.replace('/* Mobile/touch: mantém exclusão e parcelamento acessíveis sem poluir a linha. */', '/* Mobile/touch: ações secundárias — parcelamento agora fica dentro do editor. */', 1)

# 6) Remove desktop separate installment button.
desktop = '''                            <button\n                              type="button"\n                              onClick={() => openInstallmentDialog(tx)}\n                              className="p-1.5 rounded-full bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"\n                              title="Editar parcelamento"\n                              aria-label="Editar parcelamento"\n                            >\n                              <Layers className="h-3.5 w-3.5" />\n                            </button>\n'''
assert desktop in s, 'desktop installment button anchor not found'
s = s.replace(desktop, '', 1)

# 7) Give description/value a bit more room now that one action is gone.
s = s.replace('className="ml-1.5 flex items-center gap-1.5 group/card-tx-row relative shrink-0"', 'className="ml-2.5 flex items-center gap-1.5 group/card-tx-row relative shrink-0"', 1)

p.write_text(s)
print('patched cards.tsx')
