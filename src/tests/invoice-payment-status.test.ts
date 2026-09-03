import { describe, expect, it } from "bun:test";
import { getInvoicePaymentStatus, remainingInvoiceAmount } from "@/lib/invoice-payment-status";

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
