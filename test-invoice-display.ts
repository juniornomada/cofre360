import { supabase } from "./src/integrations/supabase/client";
import { groupByBillingCycle } from "./src/lib/invoice-utils";

async function testInvoiceDisplay() {
  const cardName = 'Porto Bank';
  console.log(`Checking transactions for card: ${cardName}`);

  const { data, error } = await supabase
    .from("transactions")
    .select("id, name, icon, category, date, amount, type, card, created_at, total_installments, installment_number, installment_group_id")
    .eq("card", cardName)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching transactions:", error);
    return;
  }

  console.log(`Found ${data?.length || 0} transactions.`);
  
  if (data && data.length > 0) {
    const card = { closing_day: 3, due_day: 10 }; // Based on earlier query
    const periods = groupByBillingCycle(data as any, card.closing_day, card.due_day);
    
    console.log(`Grouped into ${periods.length} periods.`);
    periods.forEach(p => {
      console.log(`Period: ${p.label} | Transactions: ${p.transactions.length} | Total: ${p.total}`);
      if (p.transactions.length > 0) {
          console.log(`  First Tx: ${p.transactions[0].name} - ${p.transactions[0].date} - Card: ${p.transactions[0].card}`);
      }
    });
  }
}

testInvoiceDisplay();
