from pathlib import Path

p = Path('src/routes/cards.tsx')
s = p.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f'anchor not found: {label}')
    s = s.replace(old, new, 1)

replace_once(
'''type PaymentLine = {
  accountId: string;
  amount: string;
};
''',
'''type PaymentLine = {
  accountId: string;
  amount: string;
};

type CardRefund = {
  id: string;
  transaction_id: string;
  card_name: string;
  original_amount: number | string;
  refund_amount: number | string;
  status: "pending" | "confirmed" | "cancelled";
  expected_by: string | null;
  note: string | null;
  confirmed_at: string | null;
  refund_transaction_id: string | null;
};
''',
'CardRefund type',
)

replace_once(
'''  const [invoiceCard, setInvoiceCard] = useState<CardData | null>(null);
  const [cardTransactions, setCardTransactions] = useState<CardTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
''',
'''  const [invoiceCard, setInvoiceCard] = useState<CardData | null>(null);
  const [cardTransactions, setCardTransactions] = useState<CardTransaction[]>([]);
  const [cardRefunds, setCardRefunds] = useState<CardRefund[]>([]);
  const [confirmingRefundId, setConfirmingRefundId] = useState<string | null>(null);
  const [loadingTx, setLoadingTx] = useState(false);
''',
'refund state',
)

replace_once(
'''      .on("postgres_changes", { event: "*", schema: "public", table: "card_payments" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_accounts" }, scheduleFetch)
''',
'''      .on("postgres_changes", { event: "*", schema: "public", table: "card_payments" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_refunds" }, scheduleFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_accounts" }, scheduleFetch)
''',
'realtime card refunds',
)

old_open = '''      const [, txResult] = await Promise.all([
        fetchAll(),
        supabase
          .from("transactions")
          .select("id, name, icon, category, date, purchase_date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
          .eq("card", card.name)
          .order("created_at", { ascending: false }),
      ]);
      if (txResult.error) throw txResult.error;
      setCardTransactions((txResult.data as CardTransaction[]) || []);
'''
new_open = '''      const [, txResult, refundsResult] = await Promise.all([
        fetchAll(),
        supabase
          .from("transactions")
          .select("id, name, icon, category, date, purchase_date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
          .eq("card", card.name)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("card_refunds")
          .select("id, transaction_id, card_name, original_amount, refund_amount, status, expected_by, note, confirmed_at, refund_transaction_id")
          .eq("card_name", card.name)
          .order("created_at", { ascending: false }),
      ]);
      if (txResult.error) throw txResult.error;
      if (refundsResult.error) throw refundsResult.error;
      setCardTransactions((txResult.data as CardTransaction[]) || []);
      setCardRefunds((refundsResult.data as CardRefund[]) || []);
'''
if s.count(old_open) < 2:
    raise SystemExit(f'expected two transaction refresh anchors, found {s.count(old_open)}')
s = s.replace(old_open, new_open, 1)
s = s.replace(old_open, new_open, 1)

refresh_end = '''  };



  const invoiceReferenceDate = (() => {
'''
confirm_fn = '''  };

  const confirmCardRefund = async (refund: CardRefund, tx: CardTransaction) => {
    if (refund.status !== "pending" || confirmingRefundId) return;
    setConfirmingRefundId(refund.id);
    try {
      const refundName = `Reembolso — ${normalizePaymentDescription(tx.name, { stripInstallmentSuffix: true })}`;
      const { data: inserted, error: insertError } = await supabase
        .from("transactions")
        .insert(sanitizeTransactionWrite({
          name: refundName,
          amount: Number(refund.refund_amount),
          type: "income",
          category: "Receita > Reembolso",
          icon: "↩️",
          date: format(new Date(), "dd-MM-yyyy"),
          card: tx.card || invoiceCard?.name || refund.card_name,
        }))
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error: refundError } = await (supabase as any)
        .from("card_refunds")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          refund_transaction_id: inserted?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refund.id);

      if (refundError) {
        if (inserted?.id) await supabase.from("transactions").delete().eq("id", inserted.id);
        throw refundError;
      }

      toast.success("Reembolso confirmado e lançado no cartão");
      await refreshInvoiceSilently(invoiceCard);
    } catch (error: any) {
      console.error("Error confirming card refund:", error);
      toast.error(mapServerError(error, "Erro ao confirmar reembolso"));
    } finally {
      setConfirmingRefundId(null);
    }
  };

  const formatRefundExpectedDate = (value: string | null) => {
    if (!value) return null;
    const match = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  };



  const invoiceReferenceDate = (() => {
'''
replace_once(refresh_end, confirm_fn, 'confirm refund function insertion')

amount_old = '''                          <span className="text-xs font-semibold text-destructive tabular-nums shrink-0">
                            -R$ {Number(tx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
'''
amount_new = '''                          <span className={cn(
                            "text-xs font-semibold tabular-nums shrink-0",
                            tx.type === "income" ? "text-emerald-600" : "text-destructive",
                          )}>
                            {tx.type === "income" ? "+" : "-"}R$ {Number(tx.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
'''
replace_once(amount_old, amount_new, 'income amount display')

meta_old = '''                          <p className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="min-w-0 truncate">{tx.category}</span>
                            <span className="shrink-0 whitespace-nowrap">· {getInvoicePurchaseDate(tx, cardTransactions) || "definir"}</span>
                          </p>
                        </div>
'''
meta_new = '''                          <p className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="min-w-0 truncate">{tx.category}</span>
                            <span className="shrink-0 whitespace-nowrap">· {getInvoicePurchaseDate(tx, cardTransactions) || "definir"}</span>
                          </p>
                          {(() => {
                            const refund = cardRefunds.find((item) =>
                              item.transaction_id === tx.id && item.status !== "cancelled"
                            );
                            if (!refund) return null;
                            const pending = refund.status === "pending";
                            return (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={cn(
                                  "rounded-md border px-1.5 py-0.5 text-[9px] font-bold leading-none",
                                  pending
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                                )}>
                                  {pending ? "Reembolso pendente" : "Reembolso confirmado"}
                                </span>
                                <span className="text-[9px] font-semibold tabular-nums text-muted-foreground">
                                  R$ {Number(refund.refund_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                                {pending && refund.expected_by && (
                                  <span className="text-[9px] text-muted-foreground">
                                    até {formatRefundExpectedDate(refund.expected_by)}
                                  </span>
                                )}
                                {pending && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      confirmCardRefund(refund, tx);
                                    }}
                                    disabled={confirmingRefundId === refund.id}
                                    className="rounded-md bg-emerald-600/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 hover:bg-emerald-600/20 disabled:opacity-50"
                                  >
                                    {confirmingRefundId === refund.id ? "Confirmando…" : "Confirmar"}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
'''
replace_once(meta_old, meta_new, 'refund badge')

p.write_text(s, encoding='utf-8')
