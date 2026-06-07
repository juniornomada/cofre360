import { CardData, BankAccount, PaymentLine } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DateTime } from "luxon";

export async function processCardPayment({
  payingCard,
  paymentLines,
  paymentTotal,
  bankAccounts,
  cardTotals,
  cardPayments
}: {
  payingCard: CardData;
  paymentLines: PaymentLine[];
  paymentTotal: number;
  bankAccounts: BankAccount[];
  cardTotals: Record<string, number>;
  cardPayments: Record<string, number>;
}) {
  const validLines = paymentLines.filter((l) => l.accountId && parseFloat(l.amount) > 0);
  if (validLines.length === 0) throw new Error("Nenhuma conta selecionada");

  const totalInvoice = cardTotals[payingCard.name] || 0;
  const totalPaidAlready = cardPayments[payingCard.id] || 0;
  const remainingBeforeThis = Math.max(0, totalInvoice - totalPaidAlready);
  const isTotalPayment = Math.abs(paymentTotal - remainingBeforeThis) < 0.01;
  
  const paymentName = isTotalPayment 
    ? `Pagamento Total fatura cartão ${payingCard.name}` 
    : `Pagamento Parcial fatura cartão ${payingCard.name}`;

  const dateFormatted = DateTime.now().setLocale('pt-BR').toFormat('d LLL');

  // 1. Create card_payments records
  const inserts = validLines.map((l) => ({
    card_id: payingCard.id,
    bank_account_id: l.accountId,
    amount: parseFloat(l.amount),
  }));
  const { error: payError } = await supabase.from("card_payments").insert(inserts);
  if (payError) throw payError;

  // 2. Update bank balances and create expense transactions
  for (const line of validLines) {
    const account = bankAccounts.find((a) => a.id === line.accountId);
    const amount = parseFloat(line.amount);
    if (account) {
      // Update balance
      const { error: balError } = await supabase.from("bank_accounts").update({ balance: account.balance - amount }).eq("id", line.accountId);
      if (balError) throw balError;
      
      // Create transaction
      const { error: txError } = await supabase.from("transactions").insert({
        name: paymentName,
        amount: amount,
        type: "expense",
        category: "Impostos/Taxas > Outros",
        icon: "💳",
        date: dateFormatted,
        bank_account_id: line.accountId,
        created_at: new Date().toISOString()
      });
      if (txError) throw txError;
    }
  }
}
