import { describe, expect, it } from "vitest";
import { replaceCardTransactionsInLedger } from "@/lib/card-scoped-ledger";

type Row = { id: string; card: string; date: string; amount: number; type: "expense" | "income" };

const allRows: Row[] = [
  { id: "mp-oct", card: "Mercado Pago", date: "2026-10-10", amount: 2246.37, type: "expense" },
  { id: "porto-nov", card: "Porto Bank", date: "2026-11-05", amount: 1980.20, type: "expense" },
  { id: "porto-dec", card: "Porto Bank", date: "2026-12-05", amount: 500, type: "expense" },
];

const totalForCard = (rows: Row[], card: string) =>
  Math.round(rows.filter((row) => row.card === card).reduce(
    (sum, row) => sum + (row.type === "income" ? -row.amount : row.amount),
    0,
  ) * 100) / 100;

describe("Scoped card refreshes do not erase unrelated invoices", () => {
  it("preserves Porto Bank's November invoice while paying R$ 15 + R$ 40 on Mercado Pago", () => {
    const payments = [15, 40];
    const paidMercadoPago = payments.reduce((sum, payment) => sum + payment, 0);
    const scopedMercadoPagoRows: Row[] = [
      { ...allRows[0], amount: 2246.37 },
    ];

    const afterPartialPayment = replaceCardTransactionsInLedger(
      allRows, "Mercado Pago", scopedMercadoPagoRows,
    );

    expect(paidMercadoPago).toBe(55);
    expect(Math.round((totalForCard(afterPartialPayment, "Mercado Pago") - paidMercadoPago) * 100) / 100).toBe(2191.37);
    expect(afterPartialPayment.filter((row) => row.card === "Porto Bank")).toEqual(allRows.slice(1));
    expect(totalForCard(afterPartialPayment, "Porto Bank")).toBe(2480.2);
    expect(afterPartialPayment.some((row) => row.card === "Porto Bank" && row.date.startsWith("2026-11"))).toBe(true);
    expect(allRows).toHaveLength(3); // unchanged original ledger
  });

  it("updates one card's rows without duplicating its previous transactions", () => {
    const refreshed: Row[] = [
      { id: "mp-oct", card: "Mercado Pago", date: "2026-10-10", amount: 2000, type: "expense" },
      { id: "mp-nov", card: "Mercado Pago", date: "2026-11-10", amount: 100, type: "expense" },
    ];
    const result = replaceCardTransactionsInLedger(allRows, "Mercado Pago", refreshed);
    expect(result.filter((row) => row.card === "Mercado Pago")).toEqual(refreshed);
    expect(result.filter((row) => row.card === "Porto Bank")).toEqual(allRows.slice(1));
    expect(result).toHaveLength(4);
  });

  it("keeps other cards even if a scoped query temporarily returns an empty list", () => {
    const result = replaceCardTransactionsInLedger(allRows, "Mercado Pago", []);
    expect(result).toEqual(allRows.slice(1));
  });

  it("rejects unrelated card rows accidentally returned by a scoped query", () => {
    const result = replaceCardTransactionsInLedger(allRows, "Mercado Pago", [
      allRows[0],
      { ...allRows[1], amount: 0 },
    ]);
    // Scoped merges may regroup cards in the ledger, but cannot mutate
    // another card's transactions or import a wrong-card update.
    expect(result).toHaveLength(allRows.length);
    expect(result.find((row) => row.id === "mp-oct")).toEqual(allRows[0]);
    expect(result.filter((row) => row.card === "Porto Bank")).toEqual(allRows.slice(1));
  });

  it("does not erase Mercado Pago while refreshing only Porto Bank invoice details", () => {
    const result = replaceCardTransactionsInLedger(allRows, "Porto Bank", [
      { ...allRows[1], amount: 1900 },
    ]);
    expect(result.find((row) => row.card === "Mercado Pago")).toEqual(allRows[0]);
    expect(result.filter((row) => row.card === "Porto Bank")).toHaveLength(1);
  });
});
