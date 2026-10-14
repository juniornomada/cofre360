import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CardTransaction } from "@/lib/invoice-utils";

const store = vi.hoisted(() => ({ rows: [] as CardTransaction[] }));

// O teste usa a função de exclusão verdadeira, com um banco em memória.
// Nenhuma operação toca dados reais do usuário.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "transactions") throw new Error(`Unexpected table: ${table}`);
      const deleteGroup = (groupId: string, fromNumber: number) => {
        const deleted = store.rows.filter((row) =>
          row.installment_group_id === groupId &&
          Number(row.installment_number ?? 1) >= fromNumber,
        );
        store.rows = store.rows.filter((row) => !deleted.includes(row));
        return Promise.resolve({ data: deleted.map((row) => ({ id: row.id })), error: null });
      };
      return {
        delete: () => ({
          eq: (field: string, value: string) => {
            if (field === "id") {
              store.rows = store.rows.filter((row) => row.id !== value);
              return Promise.resolve({ error: null });
            }
            if (field === "installment_group_id") {
              return {
                select: () => deleteGroup(value, 1),
                gte: (column: string, fromNumber: number) => {
                  if (column !== "installment_number") {
                    throw new Error(`Unexpected filter: ${column}`);
                  }
                  return { select: () => deleteGroup(value, fromNumber) };
                },
              };
            }
            throw new Error(`Unexpected filter: ${field}`);
          },
        }),
      };
    },
  },
}));

import { deleteTransactionScope } from "@/lib/installment-delete";
import { getCardAvailableLimit } from "@/lib/card-available-limit";
import { groupByBillingCycle } from "@/lib/invoice-utils";

const referenceDate = new Date(2026, 9, 14, 12, 0, 0);

const tx = (
  id: string,
  amount: number,
  date: string,
  groupId: string | null = null,
  installmentNumber: number | null = null,
  installments: number | null = null,
): CardTransaction => ({
  id,
  name: "Compra de teste",
  icon: null,
  category: "Compras > Outros",
  card: "Cartão de teste",
  date,
  purchase_date: date,
  amount,
  type: "expense",
  created_at: "2026-10-01T12:00:00.000Z",
  installment_group_id: groupId,
  installment_number: installmentNumber,
  total_installments: installments,
});

function periods() {
  return groupByBillingCycle(
    store.rows.filter((row) => row.card === "Cartão de teste"),
    20,
    27,
    referenceDate,
  );
}

function available(payments: Record<string, number> = {}): number {
  return getCardAvailableLimit(5000, periods(), payments);
}

describe("Card limit returns when deleting a purchase", () => {
  beforeEach(() => {
    store.rows = [];
  });

  it("restores the exact unpaid purchase amount after deleting one current-invoice row", async () => {
    store.rows = [
      tx("main", 1200, "10-10-2026"),
      tx("delete-me", 350, "12-10-2026"),
      tx("future", 300, "10-11-2026"),
    ];
    const current = periods().find((period) => period.key === "current");
    expect(current).toBeDefined();
    const payments = { [current!.endDate.toISOString().slice(0, 10)]: 250 };
    expect(available(payments)).toBe(3400);

    const result = await deleteTransactionScope({ id: "delete-me" }, "single");
    expect(result.deletedCount).toBe(1);
    expect(available(payments)).toBe(3750);
    expect(available(payments) - 3400).toBe(350);
  });

  it("releases only the chosen installment when deleting a single future installment", async () => {
    store.rows = [
      tx("p1", 200, "10-10-2026", "grp", 1, 3),
      tx("p2", 200, "10-11-2026", "grp", 2, 3),
      tx("p3", 200, "10-12-2026", "grp", 3, 3),
    ];
    expect(available()).toBe(4400);
    await deleteTransactionScope({ id: "p2", installment_group_id: "grp", installment_number: 2 }, "single");
    expect(store.rows.map((row) => row.id)).toEqual(["p1", "p3"]);
    expect(available()).toBe(4600);
  });

  it("releases only current and later installments when deleting future scope", async () => {
    store.rows = [
      tx("p1", 200, "10-10-2026", "grp", 1, 3),
      tx("p2", 200, "10-11-2026", "grp", 2, 3),
      tx("p3", 200, "10-12-2026", "grp", 3, 3),
    ];
    const result = await deleteTransactionScope(
      { id: "p2", installment_group_id: "grp", installment_number: 2 },
      "future",
    );
    expect(result.deletedCount).toBe(2);
    expect(store.rows.map((row) => row.id)).toEqual(["p1"]);
    expect(available()).toBe(4800);
  });

  it("releases all commitments when deleting the entire installment plan", async () => {
    store.rows = [
      tx("p1", 200, "10-10-2026", "grp", 1, 3),
      tx("p2", 200, "10-11-2026", "grp", 2, 3),
      tx("p3", 200, "10-12-2026", "grp", 3, 3),
    ];
    const result = await deleteTransactionScope(
      { id: "p2", installment_group_id: "grp", installment_number: 2 },
      "all",
    );
    expect(result.deletedCount).toBe(3);
    expect(store.rows).toHaveLength(0);
    expect(available()).toBe(5000);
  });

  it("never credits an already fully paid invoice twice after a deletion", async () => {
    store.rows = [tx("keep", 400, "10-10-2026"), tx("delete-me", 200, "11-10-2026")];
    const current = periods().find((period) => period.key === "current");
    const payments = { [current!.endDate.toISOString().slice(0, 10)]: 600 };
    expect(available(payments)).toBe(5000);

    await deleteTransactionScope({ id: "delete-me" }, "single");
    // Pagamento já liberou o limite; exclusão não pode liberar o mesmo valor novamente.
    expect(available(payments)).toBe(5000);
  });
});
