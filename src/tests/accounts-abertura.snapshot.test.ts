import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A lista de contas atual não exibe mais a linha "Abertura:"/badge legado.
 * A regra essencial permanece: saldo = abertura + receitas − despesas.
 * Estes testes protegem a regra de negócio e o saldo apresentado.
 */
const source = readFileSync(resolve(__dirname, "../routes/accounts.tsx"), "utf8");

describe("Accounts · saldo de abertura e movimentações", () => {
  it("mantém abertura como valor inicial arredondado em centavos", () => {
    expect(source).toMatch(/const openingBalance = Math\.round\(Number\(account\.balance \|\| 0\) \* 100\) \/ 100/);
  });

  it("calcula saldo atual como abertura + receitas − despesas", () => {
    expect(source).toMatch(/const currentBalance = Math\.round\(\(openingBalance \+ income - expense\) \* 100\) \/ 100/);
    const current = (opening: number, income: number, expense: number) =>
      Math.round((opening + income - expense) * 100) / 100;
    expect(current(500, 125.5, 80.25)).toBe(545.25);
    expect(current(0, 100, 180)).toBe(-80);
  });

  it("não soma rendimento separadamente ao saldo atual", () => {
    expect(source).toMatch(/const performance = Math\.round\(Number\(yieldAmount \|\| 0\) \* 100\) \/ 100/);
    expect(source).toContain("const investedPrincipal = Math.round((currentBalance - performance) * 100) / 100");
  });

  it("oculta o valor do saldo quando a visualização está desativada", () => {
    expect(source).toContain('balanceVisible ? `R$ ${currentBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "R$ ••••"');
  });

  it("destaca saldos negativos e abre transações da conta no mês selecionado", () => {
    expect(source).toContain('currentBalance < 0 ? "text-destructive" : "text-foreground"');
    expect(source).toContain('search={{ accountId: account.id, month: selectedMonthKey } as any}');
  });
});
