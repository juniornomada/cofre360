import { describe, expect, it } from "vitest";
import {
  dedupeReusableTransactionHistory,
  findExactTransactionHistoryMatch,
  getTransactionHistorySuggestions,
  type ReusableTransactionHistoryEntry,
} from "@/lib/transaction-history-suggestions";

const base = (overrides: Partial<ReusableTransactionHistoryEntry>): ReusableTransactionHistoryEntry => ({
  name: "Internet Way",
  icon: "📶",
  category: "Moradia > Internet/Telefone",
  card: null,
  bank_account_id: "account-1",
  type: "expense",
  amount: 99.9,
  date: "2026-09-02",
  created_at: "2026-09-02T10:00:00Z",
  transaction_kind: "expense",
  is_visible: true,
  ...overrides,
});

describe("transaction history suggestions", () => {
  it("finds a previous transaction from a partial, case-insensitive query", () => {
    const entries = [
      base({ name: "Internet Way" }),
      base({ name: "Supermercado", created_at: "2026-09-03T10:00:00Z" }),
    ];

    expect(getTransactionHistorySuggestions(entries, "INT", "expense").map((item) => item.name))
      .toEqual(["Internet Way"]);
  });

  it("matches accent-insensitively and ranks prefixes before inner matches", () => {
    const entries = [
      base({ name: "Minha Internet", created_at: "2026-09-03T10:00:00Z" }),
      base({ name: "Internet Way", created_at: "2026-09-02T10:00:00Z" }),
      base({ name: "Internet São José", created_at: "2026-09-01T10:00:00Z" }),
    ];

    expect(getTransactionHistorySuggestions(entries, "internet", "expense").map((item) => item.name))
      .toEqual(["Internet Way", "Internet São José", "Minha Internet"]);
  });

  it("collapses installment rows to the base transaction name and keeps the newest data", () => {
    const entries = [
      base({
        name: "Notebook (3/10)",
        category: "Compras > Eletrônicos",
        card: "Porto Bank",
        bank_account_id: null,
        created_at: "2026-10-01T10:00:00Z",
      }),
      base({
        name: "Notebook (2/10)",
        category: "Compras > Outros",
        card: "Cartão antigo",
        bank_account_id: null,
        created_at: "2026-09-01T10:00:00Z",
      }),
    ];

    const [entry] = dedupeReusableTransactionHistory(entries);
    expect(entry.name).toBe("Notebook");
    expect(entry.category).toBe("Compras > Eletrônicos");
    expect(entry.card).toBe("Porto Bank");
  });

  it("does not mix income history into expense suggestions", () => {
    const entries = [
      base({ name: "Internet Way", type: "expense" }),
      base({ name: "Internet bônus", type: "income", category: "Receita > Outros" }),
    ];

    expect(getTransactionHistorySuggestions(entries, "internet", "expense").map((item) => item.name))
      .toEqual(["Internet Way"]);
  });

  it("ignores transfers, card payments and hidden rows", () => {
    const entries = [
      base({ name: "Internet Way" }),
      base({ name: "Internet transferência", transaction_kind: "transfer", category: "Transferências" }),
      base({ name: "Internet pagamento", transaction_kind: "card_payment", category: "Pagamento de Cartão" }),
      base({ name: "Internet escondida", is_visible: false }),
    ];

    expect(getTransactionHistorySuggestions(entries, "internet", "expense").map((item) => item.name))
      .toEqual(["Internet Way"]);
  });

  it("finds an exact historical match without requiring the original capitalization", () => {
    const entries = [base({ name: "Internet Way" })];
    expect(findExactTransactionHistoryMatch(entries, "internet way", "expense")?.category)
      .toBe("Moradia > Internet/Telefone");
  });
});
