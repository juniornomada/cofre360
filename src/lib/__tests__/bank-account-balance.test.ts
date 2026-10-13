import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateBankAccountBalances,
  countsTowardBankAccountBalance,
  type BankBalanceMovement,
} from "@/lib/bank-account-balance";

const today = new Date(2026, 9, 11, 23, 59, 59, 999);

function tx(overrides: Partial<BankBalanceMovement> = {}): BankBalanceMovement {
  return {
    bank_account_id: "mercado",
    amount: 100,
    type: "income",
    date: "10-10-2026",
    transaction_status: "posted",
    is_visible: true,
    card: null,
    ...overrides,
  };
}

describe("bank account balance parity (Contas / Home / Pagar Fatura)", () => {
  it("counts a posted, visible bank credit and debit through today's cutoff", () => {
    expect(countsTowardBankAccountBalance(tx(), today)).toBe(true);
    expect(countsTowardBankAccountBalance(tx({ type: "expense" }), today)).toBe(true);
  });

  it("does not include pending, future or hidden transactions", () => {
    expect(countsTowardBankAccountBalance(tx({ transaction_status: "pending" }), today)).toBe(false);
    expect(countsTowardBankAccountBalance(tx({ date: "12-10-2026" }), today)).toBe(false);
    expect(countsTowardBankAccountBalance(tx({ is_visible: false }), today)).toBe(false);
    expect(countsTowardBankAccountBalance(tx({ bank_account_id: null }), today)).toBe(false);
  });

  it("does not debit an account for a card purchase before the bank payment", () => {
    expect(countsTowardBankAccountBalance(tx({
      type: "expense", card: "Porto Bank", amount: 850,
    }), today)).toBe(false);
    expect(countsTowardBankAccountBalance(tx({
      type: "expense", card: null, category: undefined, amount: 399.22,
    } as BankBalanceMovement), today)).toBe(true);
  });

  it("accepts an explicitly posted bank movement even when its scheduled date is later", () => {
    expect(countsTowardBankAccountBalance(tx({
      date: "12-10-2026",
      posted_at: "2026-10-11T10:00:00.000Z",
    }), today)).toBe(true);
  });

  it("applies the same real balance to account selectors, including negative accounts", () => {
    const accounts = [
      { id: "mercado", name: "Mercado Pago", balance: 1000.5 },
      { id: "porto", name: "Porto Bank", balance: -534.45 },
    ];
    const movements = [
      tx({ amount: 100 }),
      tx({ type: "expense", amount: 50.25 }),
      tx({ amount: 999, is_visible: false }),
      tx({ type: "expense", amount: 200, transaction_status: "pending" }),
      tx({ amount: 300, date: "12-10-2026" }),
      tx({ type: "expense", amount: 850, card: "Porto Bank" }),
      tx({ type: "expense", amount: 10, date: "12-10-2026", posted_at: "2026-10-11T10:00:00.000Z" }),
      tx({ bank_account_id: "porto", amount: 15.55, type: "income" }),
    ];
    const balances = calculateBankAccountBalances(accounts, movements, today);
    expect(balances.map(a => ({ id: a.id, balance: a.balance }))).toEqual([
      { id: "mercado", balance: 1040.25 },
      { id: "porto", balance: -518.9 },
    ]);
    expect(accounts[0].balance).toBe(1000.5); // original opening balance untouched
  });

  it("keeps historical closing balances separate from future credits", () => {
    const accounts = [{ id: "mercado", balance: 100 }];
    const movements = [tx({ date: "11-10-2026", amount: 30 }), tx({ date: "12-10-2026", amount: 20 })];
    const nextDay = new Date(2026, 9, 12, 23, 59, 59, 999);
    expect(calculateBankAccountBalances(accounts, movements, today)[0].balance).toBe(130);
    expect(calculateBankAccountBalances(accounts, movements, nextDay)[0].balance).toBe(150);
  });

  it("does not count malformed non-finite transaction amounts", () => {
    const accounts = [{ id: "mercado", balance: 50 }];
    expect(calculateBankAccountBalances(accounts, [tx({ amount: "Infinity" }), tx({ amount: "NaN" })], today)[0].balance).toBe(50);
  });
});

describe("financial balance guard across routes", () => {
  const cardsSrc = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");
  const accountsSrc = readFileSync(resolve(process.cwd(), "src/routes/accounts.tsx"), "utf8");
  const homeSrc = readFileSync(resolve(process.cwd(), "src/routes/home.tsx"), "utf8");

  it("computes invoice payment account options with the shared banking rules", () => {
    expect(cardsSrc).toContain("calculateBankAccountBalances(accountsRes.data, allTxRes.data || [], today)");
    expect(cardsSrc).toContain("if (allTxRes.error) throw allTxRes.error");
    expect(cardsSrc).toContain("is_visible, card, transaction_status, posted_at, transaction_date, date");
  });

  it("uses the same settlement predicate on Contas and Home", () => {
    expect(accountsSrc).toContain("countsTowardBankAccountBalance(tx, today)");
    expect(accountsSrc).toContain("countsTowardBankAccountBalance(tx, selectedCutoff)");
    expect(homeSrc).toContain("countsTowardBankAccountBalance(tx, selectedCutoff)");
  });
});
