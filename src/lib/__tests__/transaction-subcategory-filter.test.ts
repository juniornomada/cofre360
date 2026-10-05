import { describe, expect, it } from "vitest";
import { matchesTransactionCategoryDrilldown } from "@/lib/transaction-subcategory-filter";

describe("transaction subcategory drilldown", () => {
  it("keeps all subcategories when only the group is active", () => {
    expect(matchesTransactionCategoryDrilldown("Transporte > Combustível", "Transporte")).toBe(true);
    expect(matchesTransactionCategoryDrilldown("Transporte > Pedágio", "Transporte")).toBe(true);
  });

  it("filters exactly the selected subcategory", () => {
    expect(matchesTransactionCategoryDrilldown("Transporte > Combustível", "Transporte", "Combustível")).toBe(true);
    expect(matchesTransactionCategoryDrilldown("Transporte > Pedágio", "Transporte", "Combustível")).toBe(false);
  });

  it("does not mix equal subcategory names from different groups", () => {
    expect(matchesTransactionCategoryDrilldown("Transporte > Outros", "Transporte", "Outros")).toBe(true);
    expect(matchesTransactionCategoryDrilldown("Alimentação > Outros", "Transporte", "Outros")).toBe(false);
  });
});
