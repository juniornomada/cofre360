import { describe, expect, it } from "vitest";
import { collapseCategorySpendingRows } from "@/lib/category-spending";

describe("category spending purchase date", () => {
  it("uses explicit purchase_date without changing installment dates", () => {
    const rows = [
      {
        amount: 250,
        date: "2026-09-03",
        purchase_date: "2025-09-03",
        installment_group_id: "group-1",
        installment_number: 10,
        total_installments: 12,
        installment_source_amount: 3000,
        is_visible: true,
      },
      {
        amount: 250,
        date: "2026-10-03",
        purchase_date: "2025-09-03",
        installment_group_id: "group-1",
        installment_number: 11,
        total_installments: 12,
        installment_source_amount: 3000,
        is_visible: true,
      },
      {
        amount: 250,
        date: "2026-11-03",
        purchase_date: "2025-09-03",
        installment_group_id: "group-1",
        installment_number: 12,
        total_installments: 12,
        installment_source_amount: 3000,
        is_visible: true,
      },
    ];

    const installmentDatesBefore = rows.map((row) => row.date);
    const collapsed = collapseCategorySpendingRows(rows);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].date).toBe("2025-09-03");
    expect(collapsed[0].purchase_date).toBe("2025-09-03");
    expect(collapsed[0].amount).toBe(3000);
    expect(rows.map((row) => row.date)).toEqual(installmentDatesBefore);
  });

  it("keeps legacy inference when purchase_date has not been set yet", () => {
    const collapsed = collapseCategorySpendingRows([
      {
        amount: 100,
        date: "2026-09-03",
        purchase_date: null,
        installment_group_id: "legacy-group",
        installment_number: 10,
        total_installments: 12,
        installment_source_amount: 1200,
        is_visible: true,
      },
      {
        amount: 100,
        date: "2026-10-03",
        purchase_date: null,
        installment_group_id: "legacy-group",
        installment_number: 11,
        total_installments: 12,
        installment_source_amount: 1200,
        is_visible: true,
      },
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].date).toBe("2025-12-03");
    expect(collapsed[0].amount).toBe(1200);
  });

  it("uses purchase_date for a non-installment expense when present", () => {
    const collapsed = collapseCategorySpendingRows([
      {
        amount: 350,
        date: "2026-09-03",
        purchase_date: "2026-08-30",
        installment_group_id: null,
        installment_number: 1,
        total_installments: 1,
        is_visible: true,
      },
    ]);

    expect(collapsed[0].date).toBe("2026-08-30");
    expect(collapsed[0].amount).toBe(350);
  });
});
