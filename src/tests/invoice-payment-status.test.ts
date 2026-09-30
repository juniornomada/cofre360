import { describe, expect, it } from "vitest";
import {
  getInvoicePaymentStatus,
  remainingInvoiceAmount,
  shouldAutoAdvanceInvoiceMonth,
} from "@/lib/invoice-payment-status";

describe("invoice payment status", () => {
  it("treats the Porto invoice as fully paid despite floating point residue", () => {
    const total = 3491.53;
    const paid = 1458 + 2033.53;

    expect(total - paid).toBeGreaterThan(0);
    expect(remainingInvoiceAmount(total, paid)).toBe(0);
    expect(getInvoicePaymentStatus(total, paid)).toBe("total");
  });

  it("keeps genuinely partial invoices as partial", () => {
    expect(remainingInvoiceAmount(3491.53, 1458)).toBe(2033.53);
    expect(getInvoicePaymentStatus(3491.53, 1458)).toBe("partial");
  });
});

describe("automatic invoice month selection", () => {
  const total = 3491.53;
  const paid = 1458 + 2033.53;

  it("advances only when the invoice is fully paid and already past due", () => {
    expect(
      shouldAutoAdvanceInvoiceMonth({
        total,
        paid,
        dueDate: new Date(2026, 8, 25),
        today: new Date(2026, 8, 30),
      }),
    ).toBe(true);
  });

  it("keeps a fully paid invoice visible until after its due date", () => {
    expect(
      shouldAutoAdvanceInvoiceMonth({
        total,
        paid,
        dueDate: new Date(2026, 9, 10),
        today: new Date(2026, 8, 30),
      }),
    ).toBe(false);

    expect(
      shouldAutoAdvanceInvoiceMonth({
        total,
        paid,
        dueDate: new Date(2026, 8, 30),
        today: new Date(2026, 8, 30),
      }),
    ).toBe(false);
  });

  it("does not advance an overdue invoice with a remaining balance", () => {
    expect(
      shouldAutoAdvanceInvoiceMonth({
        total,
        paid: 1458,
        dueDate: new Date(2026, 8, 25),
        today: new Date(2026, 8, 30),
      }),
    ).toBe(false);
  });

  it("respects an explicit month selected by the user", () => {
    expect(
      shouldAutoAdvanceInvoiceMonth({
        total,
        paid,
        dueDate: new Date(2026, 8, 25),
        today: new Date(2026, 8, 30),
        hasExplicitMonthSelection: true,
      }),
    ).toBe(false);
  });

  it("handles the December to January boundary", () => {
    expect(
      shouldAutoAdvanceInvoiceMonth({
        total: 100,
        paid: 100,
        dueDate: new Date(2026, 11, 20),
        today: new Date(2026, 11, 31),
      }),
    ).toBe(true);
  });
});
