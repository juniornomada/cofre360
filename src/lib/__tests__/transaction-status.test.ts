import { describe, expect, it } from "vitest";
import {
  countsTowardCurrentBalance,
  shouldAutoPendScheduledTransaction,
} from "@/lib/transaction-status";

describe("scheduled transaction settlement status", () => {
  const now = new Date(2026, 9, 5, 9, 0, 0);

  it("auto-pends a future Pix/account transaction", () => {
    expect(shouldAutoPendScheduledTransaction("18-10-2026", null, now)).toBe(true);
  });

  it("does not auto-pend a credit-card purchase", () => {
    expect(shouldAutoPendScheduledTransaction("18-10-2026", "Mercado Pago", now)).toBe(false);
  });

  it("does not auto-pend today or past account transactions", () => {
    expect(shouldAutoPendScheduledTransaction("05-10-2026", null, now)).toBe(false);
    expect(shouldAutoPendScheduledTransaction("03-10-2026", null, now)).toBe(false);
  });

  it("never lets pending transactions affect the current balance", () => {
    expect(countsTowardCurrentBalance({
      transaction_status: "pending",
      transaction_date: "03-10-2026",
    }, now)).toBe(false);
  });

  it("keeps posted future rows out of the current balance until their date", () => {
    expect(countsTowardCurrentBalance({
      transaction_status: "posted",
      transaction_date: "18-10-2026",
    }, now)).toBe(false);
  });

  it("lets an explicitly posted transaction affect balance immediately", () => {
    expect(countsTowardCurrentBalance({
      transaction_status: "posted",
      transaction_date: "18-10-2026",
      posted_at: "2026-10-05T11:00:00.000Z",
    }, new Date("2026-10-05T12:00:00.000Z"))).toBe(true);
  });
});
