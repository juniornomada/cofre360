import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("QuickAdd expense with insufficient account balance", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/QuickAddTransactionDialog.tsx"), "utf8");

  it("does not block an expense when the selected account balance is lower than the expense", () => {
    expect(source).not.toContain('// Balance check for expenses from bank accounts');
    expect(source).not.toMatch(/newTx\.type === ["']expense["'][\s\S]{0,500}Saldo insuficiente/);
  });

  it("keeps insufficient-balance protection for transfers", () => {
    expect(source).toContain("const fromAcc = bankAccounts.find(a => a.id === transferFromId)");
    expect(source).toMatch(/fromAcc[\s\S]{0,300}Saldo insuficiente/);
  });
});
