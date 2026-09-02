from pathlib import Path

path = Path("src/routes/home.tsx")
text = path.read_text()

repls = [
(
'import { addCurrencyCents, fetchAllCategoryLedgerTransactions, type CategoryLedgerTransaction } from "@/lib/category-spending-ledger";\n',
'import { addCurrencyCents, fetchAllCategoryLedgerTransactions, type CategoryLedgerTransaction } from "@/lib/category-spending-ledger";\nimport { getCycleDates, groupByBillingCycle, type CardTransaction } from "@/lib/invoice-utils";\n'
),
(
'''type Card = {\n  id: string;\n  name: string;\n  emoji: string | null;\n  color: string | null;\n  is_visible: boolean | null;\n};\n''',
'''type Card = {\n  id: string;\n  name: string;\n  emoji: string | null;\n  color: string | null;\n  is_visible: boolean | null;\n  used: number;\n  closing_day: number | null;\n  due_day: number | null;\n  created_at: string | null;\n};\n\ntype CardPayment = {\n  card_id: string;\n  amount: number;\n  paid_at: string;\n  target_period: string | null;\n};\n'''
),
(
'  const [cards, setCards] = useState<Card[]>([]);\n  const [transactions, setTransactions] = useState<Tx[]>([]);\n',
'  const [cards, setCards] = useState<Card[]>([]);\n  const [cardPayments, setCardPayments] = useState<CardPayment[]>([]);\n  const [transactions, setTransactions] = useState<Tx[]>([]);\n'
),
(
'        const [accountsRes, cardsRes, txRes, remindersRes, exactCategoryLedger] = await Promise.all([\n',
'        const [accountsRes, cardsRes, txRes, paymentsRes, remindersRes, exactCategoryLedger] = await Promise.all([\n'
),
(
'''          supabase\n            .from("cards")\n            .select("id,name,emoji,color,is_visible")\n            .eq("user_id", session.user.id),\n''',
'''          supabase\n            .from("cards")\n            .select("id,name,emoji,color,is_visible,used,closing_day,due_day,created_at")\n            .eq("user_id", session.user.id),\n'''
),
(
'''          supabase\n            .from("transactions")\n            .select("id,name,icon,category,date,amount,type,card,bank_account_id,is_visible,created_at")\n            .eq("user_id", session.user.id)\n            .order("created_at", { ascending: false }),\n          supabase\n            .from("reminders")\n''',
'''          supabase\n            .from("transactions")\n            .select("id,name,icon,category,date,amount,type,card,bank_account_id,is_visible,created_at")\n            .eq("user_id", session.user.id)\n            .order("created_at", { ascending: false }),\n          supabase\n            .from("card_payments")\n            .select("card_id,amount,paid_at,target_period")\n            .eq("user_id", session.user.id),\n          supabase\n            .from("reminders")\n'''
),
(
'''        if (cardsRes.error) throw cardsRes.error;\n        if (txRes.error) throw txRes.error;\n        if (remindersRes.error) throw remindersRes.error;\n''',
'''        if (cardsRes.error) throw cardsRes.error;\n        if (txRes.error) throw txRes.error;\n        if (paymentsRes.error) throw paymentsRes.error;\n        if (remindersRes.error) throw remindersRes.error;\n'''
),
(
'''          setCards((cardsRes.data || []) as Card[]);\n          setTransactions(rawTx);\n''',
'''          setCards((cardsRes.data || []) as Card[]);\n          setCardPayments((paymentsRes.data || []) as CardPayment[]);\n          setTransactions(rawTx);\n'''
),
(
'''  const cardTotals = useMemo(() => {\n    const result: Record<string, number> = {};\n    for (const card of cards) result[card.name] = 0;\n    for (const tx of selectedMonthTransactions) {\n      if (!tx.card) continue;\n      const amount = Number(tx.amount || 0);\n      result[tx.card] = (result[tx.card] || 0) + (tx.type === "income" ? -amount : amount);\n    }\n    return result;\n  }, [cards, selectedMonthTransactions]);\n''',
'''  const cardTotals = useMemo(() => {\n    const result: Record<string, number> = {};\n\n    for (const card of cards) {\n      const cycleKey = getCycleDates(\n        selectedMonth,\n        card.closing_day || 1,\n        card.due_day || 10,\n      ).currentClose.toISOString().slice(0, 10);\n\n      const cardTxs: CardTransaction[] = transactions\n        .filter((tx) => tx.is_visible !== false && tx.card === card.name)\n        .map((tx) => ({\n          id: tx.id,\n          name: tx.name,\n          icon: tx.icon,\n          category: tx.category || "",\n          card: tx.card,\n          date: tx.date || "",\n          amount: Number(tx.amount || 0),\n          type: tx.type,\n          created_at: tx.created_at || "",\n          total_installments: null,\n          installment_number: null,\n          installment_group_id: null,\n        }));\n\n      const period = groupByBillingCycle(\n        cardTxs,\n        card.closing_day,\n        card.due_day,\n        selectedMonth,\n      ).find((item) => item.endDate.toISOString().slice(0, 10) === cycleKey);\n\n      let invoiceTotal = Number(period?.total || 0);\n\n      const openingAmount = Math.max(0, Number(card.used || 0));\n      if (openingAmount > 0 && card.created_at) {\n        const createdAt = new Date(card.created_at);\n        if (!Number.isNaN(createdAt.getTime())) {\n          const openingKey = getCycleDates(\n            createdAt,\n            card.closing_day || 1,\n            card.due_day || 10,\n          ).currentClose.toISOString().slice(0, 10);\n          if (openingKey === cycleKey) invoiceTotal += openingAmount;\n        }\n      }\n\n      let paid = 0;\n      for (const payment of cardPayments) {\n        if (payment.card_id !== card.id) continue;\n        let paymentKey = payment.target_period?.slice(0, 10) || "";\n        if (!paymentKey && payment.paid_at) {\n          const paidAt = new Date(payment.paid_at);\n          if (!Number.isNaN(paidAt.getTime())) {\n            paymentKey = getCycleDates(\n              paidAt,\n              card.closing_day || 1,\n              card.due_day || 10,\n            ).currentClose.toISOString().slice(0, 10);\n          }\n        }\n        if (paymentKey === cycleKey) paid += Number(payment.amount || 0);\n      }\n\n      result[card.name] = Math.max(0, Math.round((invoiceTotal - paid) * 100) / 100);\n    }\n\n    return result;\n  }, [cards, transactions, cardPayments, selectedMonth]);\n'''
),
]

for old, new in repls:
    if old not in text:
        raise SystemExit(f"Replacement not found:\n{old[:240]}")
    text = text.replace(old, new, 1)

path.write_text(text)
print("Home card invoice totals aligned with Cards")
