import { describe, it, expect } from "vitest";
import { buildAddTransactionNavArgs } from "@/lib/add-transaction-nav";

describe("buildAddTransactionNavArgs", () => {
  it("inclui action=add e type=expense sempre", () => {
    const args = buildAddTransactionNavArgs(null, null);
    expect(args.action).toBe("add");
    expect(args.type).toBe("expense");
  });

  it("pré-seleciona cartão pelo nome quando fornecido", () => {
    const args = buildAddTransactionNavArgs("Porto Bank", null);
    expect(args.card).toBe("Porto Bank");
  });

  it("omite card quando nome vazio ou apenas espaços", () => {
    expect(buildAddTransactionNavArgs("", null).card).toBeUndefined();
    expect(buildAddTransactionNavArgs("   ", null).card).toBeUndefined();
    expect(buildAddTransactionNavArgs(null, null).card).toBeUndefined();
    expect(buildAddTransactionNavArgs(undefined, null).card).toBeUndefined();
  });

  it("pré-seleciona a data no formato dd MMM (pt-BR) a partir do fim do período", () => {
    const endDate = new Date(2026, 6, 31); // 31/07/2026
    const args = buildAddTransactionNavArgs("Porto Bank", endDate);
    expect(args.date).toBe("31 jul");
  });

  it("cobre fronteira de meses do ano", () => {
    expect(buildAddTransactionNavArgs("X", new Date(2026, 0, 15)).date).toBe("15 jan");
    expect(buildAddTransactionNavArgs("X", new Date(2026, 11, 31)).date).toBe("31 dez");
  });

  it("omite date quando endDate é inválida ou nula", () => {
    expect(buildAddTransactionNavArgs("X", null).date).toBeUndefined();
    expect(buildAddTransactionNavArgs("X", undefined).date).toBeUndefined();
    expect(buildAddTransactionNavArgs("X", new Date("invalid")).date).toBeUndefined();
  });

  it("payload completo para fluxo típico da fatura", () => {
    const args = buildAddTransactionNavArgs("Porto Bank", new Date(2026, 6, 31));
    expect(args).toEqual({
      action: "add",
      type: "expense",
      card: "Porto Bank",
      date: "31 jul",
    });
  });
});
