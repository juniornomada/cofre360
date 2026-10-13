import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");

describe("/cards — payment may refresh one card without resetting other invoices", () => {
  it("uses a complete multi-card ledger for the dashboard and scoped merges for invoice dialogs", () => {
    expect(source).toContain("setCardTransactions(txRes.data as CardTransaction[])");

    // Opening, refreshing or paying an invoice must preserve other cards.
    const scopedRefreshCalls = source.match(/replaceCardTransactionsInLedger\(previous, card\.name,/g) || [];
    expect(scopedRefreshCalls).toHaveLength(3);
    expect(source).not.toContain("setCardTransactions((txResult.data as CardTransaction[]) || [])");
    expect(source).not.toContain("setCardTransactions((data as CardTransaction[]) || [])");
  });

  it("does not replace the global ledger with Mercado Pago-only rows during or after payment", () => {
    const start = source.indexOf("const handlePay = async () => {");
    const end = source.indexOf("\n  if (loading) {", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const paymentFlow = source.slice(start, end);

    expect(paymentFlow).toContain('supabase.rpc("create_card_payment_atomic"');
    expect(paymentFlow).toContain("await fetchAll()");
    expect(paymentFlow).not.toContain("setCardTransactions(");
    expect(paymentFlow).not.toContain("updatedTxs");
  });

  it("keeps every card's invoice and available-limit calculation grounded in its own transactions", () => {
    expect(source).toContain("const cardTransactionsFiltered = cardTransactions.filter(t => t.card === card.name)");
    expect(source).toContain("const txs = cardTransactions.filter(t => t.card === card.name)");
    expect(source).toContain("const totalAllInvoices = cards.reduce((sum, card) => sum + remainingCurrentAndFuture(card), 0)");
  });
});
