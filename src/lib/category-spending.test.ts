import { describe, expect, it } from "vitest";
import { collapseCategorySpendingRows } from "./category-spending";

describe("collapseCategorySpendingRows", () => {
  it("uses the largest positive source amount when legacy rows disagree", () => {
    const rows = [
      {
        amount: 37.99,
        date: "2026-09-02",
        purchase_date: "2026-08-20",
        installment_group_id: "legacy-group",
        installment_number: 1,
        total_installments: 8,
        installment_source_amount: 37.99,
        is_visible: true,
      },
      {
        amount: 37.96,
        date: "2026-10-02",
        purchase_date: "2026-08-20",
        installment_group_id: "legacy-group",
        installment_number: 2,
        total_installments: 8,
        installment_source_amount: 303.71,
        is_visible: true,
      },
    ];

    const collapsed = collapseCategorySpendingRows(rows);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].amount).toBe(303.71);
    expect(collapsed[0].purchase_date).toBe("2026-08-20");
  });
});
