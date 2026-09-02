from pathlib import Path

path = Path('src/routes/transactions.tsx')
text = path.read_text()

old_guard = '''     if (isTransferTransaction(editTx)) {
       if (!editTx.installment_group_id) {
         toast.error("Esta transferência antiga não possui vínculo entre origem e destino.");
         return;
       }
       if (!transferFromId || !transferToId || transferFromId === transferToId) {
'''
new_guard = '''     if (isTransferTransaction(editTx)) {
       if (!transferFromId || !transferToId || transferFromId === transferToId) {
'''
if old_guard not in text:
    raise SystemExit('legacy transfer guard not found')
text = text.replace(old_guard, new_guard, 1)

old_pair = '''       let savedSuccessfully = false;
       try {
         const { data: pairRows, error: pairError } = await supabase
           .from("transactions")
           .select("id,icon,name,category,date,amount,type,card,bank_account_id,installment_group_id")
           .eq("installment_group_id", editTx.installment_group_id);
         if (pairError) throw pairError;

         const transferRows = (pairRows || []).filter(row => isTransferTransaction(row as Transaction));
         const fromRow = transferRows.find(row => row.type === "expense");
         const toRow = transferRows.find(row => row.type === "income");
         if (!fromRow || !toRow) {
           toast.error("Não foi possível localizar as duas pontas desta transferência.");
           return;
         }

         const fromAccount = bankAccounts.find(account => account.id === transferFromId);
'''
new_pair = '''       let savedSuccessfully = false;
       try {
         let transferRows: Transaction[] = [];
         if (editTx.installment_group_id) {
           const { data: pairRows, error: pairError } = await supabase
             .from("transactions")
             .select("id,icon,name,category,date,amount,type,card,bank_account_id,installment_group_id,created_at")
             .eq("installment_group_id", editTx.installment_group_id);
           if (pairError) throw pairError;
           transferRows = (pairRows || []).filter(row => isTransferTransaction(row as Transaction)) as Transaction[];
         }

         let fromRow = transferRows.find(row => row.type === "expense");
         let toRow = transferRows.find(row => row.type === "income");
         let resolvedGroupId = editTx.installment_group_id || null;

         // Legacy transfers may have one side without installment_group_id (or a group
         // containing only one side). Recover the mate conservatively using the values
         // persisted before editing: same date, amount, opposite type and creation time.
         if (!fromRow || !toRow) {
           const { data: persistedData, error: persistedError } = await supabase
             .from("transactions")
             .select("id,icon,name,category,date,amount,type,card,bank_account_id,installment_group_id,created_at")
             .eq("id", editTx.id)
             .maybeSingle();
           if (persistedError) throw persistedError;

           const persistedTx = (persistedData || editTx) as Transaction;
           const oppositeType: "income" | "expense" = persistedTx.type === "expense" ? "income" : "expense";
           const { data: legacyRows, error: legacyError } = await supabase
             .from("transactions")
             .select("id,icon,name,category,date,amount,type,card,bank_account_id,installment_group_id,created_at")
             .eq("date", persistedTx.date)
             .eq("amount", persistedTx.amount)
             .eq("type", oppositeType)
             .neq("id", persistedTx.id)
             .ilike("category", "Transfer%")
             .limit(20);
           if (legacyError) throw legacyError;

           const candidates = (legacyRows || []).filter(row => isTransferTransaction(row as Transaction)) as Transaction[];
           const anchorTime = persistedTx.created_at ? new Date(persistedTx.created_at).getTime() : Number.NaN;
           const exactTimestamp = candidates.filter(row => !!persistedTx.created_at && row.created_at === persistedTx.created_at);
           const nearby = Number.isFinite(anchorTime)
             ? candidates.filter(row => {
                 const rowTime = row.created_at ? new Date(row.created_at).getTime() : Number.NaN;
                 return Number.isFinite(rowTime) && Math.abs(rowTime - anchorTime) <= 5000;
               })
             : [];
           const legacyMate = exactTimestamp.length === 1
             ? exactTimestamp[0]
             : nearby.length === 1
               ? nearby[0]
               : (!Number.isFinite(anchorTime) && candidates.length === 1 ? candidates[0] : undefined);

           if (!legacyMate) {
             toast.error("Não foi possível identificar com segurança a outra ponta desta transferência antiga.");
             return;
           }

           fromRow = persistedTx.type === "expense" ? persistedTx : legacyMate;
           toRow = persistedTx.type === "income" ? persistedTx : legacyMate;
           resolvedGroupId = persistedTx.installment_group_id || legacyMate.installment_group_id ||
             ((typeof crypto !== "undefined" && "randomUUID" in crypto)
               ? crypto.randomUUID()
               : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
         }

         if (!fromRow || !toRow) {
           toast.error("Não foi possível localizar as duas pontas desta transferência.");
           return;
         }
         if (!resolvedGroupId) {
           resolvedGroupId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
             ? crypto.randomUUID()
             : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
         }

         const fromAccount = bankAccounts.find(account => account.id === transferFromId);
'''
if old_pair not in text:
    raise SystemExit('transfer pair block not found')
text = text.replace(old_pair, new_pair, 1)

old_shared = '''         const shared = {
           icon: "🔄",
           category: "Transferências > Outros",
           date: editTx.date,
           amount: transferAmount,
           card: null,
         };
'''
new_shared = '''         const shared = {
           icon: "🔄",
           category: "Transferências > Outros",
           date: editTx.date,
           amount: transferAmount,
           card: null,
           installment_group_id: resolvedGroupId,
         };
'''
if old_shared not in text:
    raise SystemExit('transfer shared block not found')
text = text.replace(old_shared, new_shared, 1)

old_rollback = '''               card: fromRow.card,
               bank_account_id: fromRow.bank_account_id,
             })
'''
new_rollback = '''               card: fromRow.card,
               bank_account_id: fromRow.bank_account_id,
               installment_group_id: fromRow.installment_group_id ?? null,
             })
'''
if old_rollback not in text:
    raise SystemExit('transfer rollback block not found')
text = text.replace(old_rollback, new_rollback, 1)

path.write_text(text)
