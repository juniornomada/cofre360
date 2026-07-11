import { describe, it, expect } from "vitest";
import { groupByBillingCycle, parseTxDate, getCycleDates, type CardTransaction } from "@/lib/invoice-utils";

/**
 * Validates the invoice `dueDate` computed by `groupByBillingCycle` at
 * end-of-year / start-of-year boundaries when the transaction carries a
 * textual `date` (e.g. "28 dez", "02 jan") plus a real ISO `created_at`.
 *
 * Card cycle used across the suite:
 *   closing day = 10, due day = 20
 * Consequence: a tx whose date falls in [10 X, 10 X+1) closes on day 10 of
 * month X+1 and is due on day 20 of the SAME month (or the next month if
 * dueDay <= closingDay, but here 20 > 10 so it is always same month).
 */

const CLOSING = 10;
const DUE = 20;

function mkTx(id: string, dateText: string, createdAt: string, amount = 100): CardTransaction {
  return {
    id, name: id, icon: null, category: "food", card: "Card",
    date: dateText, amount, type: "expense", created_at: createdAt,
    total_installments: null, installment_number: null, installment_group_id: null,
  };
}

/** Finds the invoice period that contains tx `id`. */
function periodOf(txId: string, txs: CardTransaction[], ref: Date) {
  const periods = groupByBillingCycle(txs, CLOSING, DUE, ref);
  const p = periods.find((pd) => pd.transactions.some((t) => t.id === txId));
  if (!p) throw new Error(`period not found for tx ${txId}`);
  return p;
}

describe("dueDate at year boundaries — textual date + correct created_at", () => {
  describe("end-of-December transactions", () => {
    it("'28 dez' created 2026-12-28 → due 20 Jan 2027", () => {
      const ref = new Date(2027, 0, 15); // mid Jan 2027
      const p = periodOf("t", [mkTx("t", "28 dez", "2026-12-28T12:00:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0);
      expect(p.dueDate.getDate()).toBe(20);
      // sanity: end of window (closing) is 10 Jan 2027
      expect(p.endDate.getFullYear()).toBe(2027);
      expect(p.endDate.getMonth()).toBe(0);
      expect(p.endDate.getDate()).toBe(10);
    });

    it("'31 dez' created 2026-12-31T23:59Z → due 20 Jan 2027", () => {
      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "31 dez", "2026-12-31T23:59:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0);
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("'15 dez' created 2026-12-15 → due 20 Dec 2026 (before the year rolls)", () => {
      // Ref inside the Dec cycle (which closes on 10 Jan 2027, due 20 Jan 2027).
      // But 15 dez < 10 jan, so 15 dez lands in the cycle that closes Jan 10.
      // Actually with closing=10, 15 dez falls in [10 Dec 2026, 10 Jan 2027) →
      // closes 10 Jan 2027, due 20 Jan 2027.
      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "15 dez", "2026-12-15T12:00:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0);
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("'05 dez' created 2026-12-05 → falls in the PREVIOUS cycle: due 20 Dec 2026", () => {
      // 05 dez < 10 Dec 2026 → cycle [10 Nov, 10 Dec), closes 10 Dec, due 20 Dec 2026.
      const ref = new Date(2026, 11, 15); // mid-Dec 2026
      const p = periodOf("t", [mkTx("t", "05 dez", "2026-12-05T12:00:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2026);
      expect(p.dueDate.getMonth()).toBe(11);
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("symmetric heuristic: '31 dez' created 2027-01-01 (early Jan) still bills in Jan 2027", () => {
      // parseTxDate rolls year back → 31 Dec 2026, cycle closes 10 Jan 2027,
      // due 20 Jan 2027.
      const parsed = parseTxDate("31 dez", "2027-01-01T00:30:00Z");
      expect(parsed.getFullYear()).toBe(2026);

      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "31 dez", "2027-01-01T00:30:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0);
      expect(p.dueDate.getDate()).toBe(20);
    });
  });

  describe("start-of-January transactions", () => {
    it("'02 jan' created 2027-01-02 → cycle closes 10 Jan 2027, due 20 Jan 2027", () => {
      // 02 jan < 10 jan → falls in [10 Dec 2026, 10 Jan 2027).
      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "02 jan", "2027-01-02T12:00:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0); // Jan
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("'02 jan' created 2026-12-31T23:59Z (year-boundary heuristic) → due 20 Jan 2027", () => {
      const parsed = parseTxDate("02 jan", "2026-12-31T23:59:00Z");
      expect(parsed.getFullYear()).toBe(2027);
      expect(parsed.getMonth()).toBe(0);

      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "02 jan", "2026-12-31T23:59:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0); // Jan
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("'09 jan' created 2027-01-09 → still in the Dec 26→Jan 27 cycle, due 20 Jan 2027", () => {
      // 09 jan < 10 jan → cycle [10 Dec 2026, 10 Jan 2027), due 20 Jan 2027.
      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "09 jan", "2027-01-09T12:00:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0);
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("'15 jan' created 2027-01-15 → due 20 Feb 2027", () => {
      const ref = new Date(2027, 1, 5);
      const p = periodOf("t", [mkTx("t", "15 jan", "2027-01-15T12:00:00Z")], ref);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(1);
      expect(p.dueDate.getDate()).toBe(20);
    });
  });

  describe("closing-day exact boundary", () => {
    it("'10 jan' (== closingDay) created 2027-01-10 → belongs to the Jan cycle, due 20 Feb 2027", () => {
      // Rule: cycle range is [prevClose, currentClose). A tx exactly ON
      // closing day (10 Jan) falls into the NEXT cycle (closes 10 Feb).
      const ref = new Date(2027, 1, 5);
      const p = periodOf("t", [mkTx("t", "10 jan", "2027-01-10T00:00:00Z")], ref);
      expect(p.endDate.getMonth()).toBe(1); // closes 10 Feb
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(1); // due 20 Feb
      expect(p.dueDate.getDate()).toBe(20);
    });

    it("'10 dez' (== closingDay) created 2026-12-10 → cycle closes 10 Jan 2027, due 20 Jan 2027", () => {
      const ref = new Date(2027, 0, 15);
      const p = periodOf("t", [mkTx("t", "10 dez", "2026-12-10T00:00:00Z")], ref);
      expect(p.endDate.getFullYear()).toBe(2027);
      expect(p.endDate.getMonth()).toBe(0);
      expect(p.endDate.getDate()).toBe(10);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(0);
      expect(p.dueDate.getDate()).toBe(20);
    });
  });

  describe("Dec + Jan siblings share the correct due dates when mixed in one group", () => {
    it("2-parcela purchase '28 dez' + '28 jan' produces due dates 20 Jan 2027 and 20 Feb 2027", () => {
      const ref = new Date(2027, 0, 15);
      const periods = groupByBillingCycle(
        [
          mkTx("dec", "28 dez", "2026-12-28T12:00:00Z"),
          mkTx("jan", "28 jan", "2027-01-28T12:00:00Z"),
        ],
        CLOSING,
        DUE,
        ref,
      );
      const decPeriod = periods.find((p) => p.transactions.some((t) => t.id === "dec"))!;
      const janPeriod = periods.find((p) => p.transactions.some((t) => t.id === "jan"))!;

      expect(decPeriod.dueDate.getFullYear()).toBe(2027);
      expect(decPeriod.dueDate.getMonth()).toBe(0);
      expect(decPeriod.dueDate.getDate()).toBe(20);

      expect(janPeriod.dueDate.getFullYear()).toBe(2027);
      expect(janPeriod.dueDate.getMonth()).toBe(1);
      expect(janPeriod.dueDate.getDate()).toBe(20);

      // Both due dates strictly ordered.
      expect(janPeriod.dueDate.getTime()).toBeGreaterThan(decPeriod.dueDate.getTime());
    });
  });

  describe("dueDay <= closingDay: due date rolls to the NEXT month", () => {
    // Card variant: closing 25, due 05 → due 05 is BEFORE closing 25 within
    // the same month, so makeDue must push to the following month.
    const C = 25;
    const D = 5;

    it("'28 dez' with closing=25, due=5 → cycle closes 25 Jan 2027, due 05 Feb 2027", () => {
      const ref = new Date(2027, 0, 26); // just after Jan closing
      const periods = groupByBillingCycle(
        [mkTx("t", "28 dez", "2026-12-28T12:00:00Z")],
        C,
        D,
        ref,
      );
      const p = periods.find((pd) => pd.transactions.some((t) => t.id === "t"))!;
      expect(p.endDate.getFullYear()).toBe(2027);
      expect(p.endDate.getMonth()).toBe(0);
      expect(p.endDate.getDate()).toBe(25);
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(1); // Feb
      expect(p.dueDate.getDate()).toBe(5);
    });

    it("'02 jan' with closing=25, due=5 → cycle closes 25 Jan 2027, due 05 Feb 2027", () => {
      const ref = new Date(2027, 0, 26);
      const periods = groupByBillingCycle(
        [mkTx("t", "02 jan", "2027-01-02T12:00:00Z")],
        C,
        D,
        ref,
      );
      const p = periods.find((pd) => pd.transactions.some((t) => t.id === "t"))!;
      expect(p.dueDate.getFullYear()).toBe(2027);
      expect(p.dueDate.getMonth()).toBe(1);
      expect(p.dueDate.getDate()).toBe(5);
    });
  });

  describe("cross-check with getCycleDates helper", () => {
    it("groupByBillingCycle.dueDate matches getCycleDates(currentClose).makeDue at the Dec→Jan flip", () => {
      const ref = new Date(2027, 0, 15);
      const { currentClose, currentDue } = getCycleDates(ref, CLOSING, DUE);
      expect(currentClose.getFullYear()).toBe(2027);
      expect(currentClose.getMonth()).toBe(0);
      expect(currentDue.getFullYear()).toBe(2027);
      expect(currentDue.getMonth()).toBe(0);
      expect(currentDue.getDate()).toBe(20);

      const p = periodOf("t", [mkTx("t", "28 dez", "2026-12-28T12:00:00Z")], ref);
      expect(p.dueDate.getTime()).toBe(currentDue.getTime());
    });

    it("groupByBillingCycle.dueDate matches getCycleDates at the Jan→Feb flip", () => {
      const ref = new Date(2027, 1, 5);
      const { currentClose, currentDue } = getCycleDates(ref, CLOSING, DUE);
      expect(currentClose.getFullYear()).toBe(2027);
      expect(currentClose.getMonth()).toBe(1);
      expect(currentDue.getFullYear()).toBe(2027);
      expect(currentDue.getMonth()).toBe(1);
      expect(currentDue.getDate()).toBe(20);

      const p = periodOf("t", [mkTx("t", "15 jan", "2027-01-15T12:00:00Z")], ref);
      expect(p.dueDate.getTime()).toBe(currentDue.getTime());
    });
  });
});
