import { describe, expect, it } from "vitest";
import { matchesTransactionCategoryFilter } from "@/lib/transaction-category-drilldown";

describe("transaction subcategory drilldown", () => {
  it("keeps all transport rows when only the group is selected", () => {
    expect(matchesTransactionCategoryFilter("Transporte > Combustível", "Transporte", null)).toBe(true);
    expect(matchesTransactionCategoryFilter("Transporte > Pedágio", "Transporte", null)).toBe(true);
  });

  it("filters exactly the selected subcategory inside the active group", () => {
    expect(matchesTransactionCategoryFilter("Transporte > Combustível", "Transporte", "Combustível")).toBe(true);
    expect(matchesTransactionCategoryFilter("Transporte > Pedágio", "Transporte", "Combustível")).toBe(false);
    expect(matchesTransactionCategoryFilter("Moradia > Combustível", "Transporte", "Combustível")).toBe(false);
  });

  it("does not broaden a subcategory selection when another group has the same label", () => {
    expect(matchesTransactionCategoryFilter("Transporte > Outros", "Transporte", "Outros")).toBe(true);
    expect(matchesTransactionCategoryFilter("Alimentação > Outros", "Transporte", "Outros")).toBe(false);
  });
});
