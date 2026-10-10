import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("QuickAdd expense with insufficient account balance", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/QuickAddTransactionDialog.tsx"), "utf8");

  it("does not block an expense when the selected account balance is lower than the expense", () => {
    expect(source).not.toContain('// Balance check for expenses from bank accounts');
    expect(source).not.toMatch(/newTx\.type === ["']expense["'][\s\S]{0,500}Saldo insuficiente/);
  });

  it("allows transfers to overdraw while requiring two distinct accounts", () => {
    // O app registra saldos reais, inclusive negativos. Validar a origem e
    // o destino continua obrigatório, mas não bloquear a operação por saldo.
    expect(source).toContain("const fromAcc = bankAccounts.find(a => a.id === transferFromId)");
    expect(source).toContain("if (!transferFromId || !transferToId || transferFromId === transferToId)");
    expect(source).toContain('toast.error("Selecione contas diferentes para a transferência.")');
    expect(source).not.toMatch(/fromAcc[\\s\\S]{0,500}Saldo insuficiente/);
  });
});
