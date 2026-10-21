import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TransactionItem } from "@/components/TransactionItem";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    class RO {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
});

const base = {
  id: "pending-2-of-4",
  name: "Droga Raia 2/4",
  icon: "💊",
  category: "Saúde > Farmácia",
  type: "expense" as const,
  amount: 178.15,
  date: "18-10-2026",
  created_at: "2026-10-03T17:22:47Z",
  purchase_date: "2026-10-03",
  installment_number: 2,
  total_installments: 4,
  installment_group_id: "group-1",
  transaction_status: "pending",
};

describe("Efetivação de parcela Pix pendente", () => {
  it("exibe a ação mesmo quando há popover de data original da compra", () => {
    const onPost = vi.fn();
    const onEdit = vi.fn();
    const { container } = render(<TransactionItem {...base} onPost={onPost} onEdit={onEdit} />);
    expect(screen.getByText(/Compra: 03 OUT/i)).toBeTruthy();
    const postButton = screen.getByRole("button", { name: "Efetivar lançamento pendente" });
    fireEvent.click(postButton);
    expect(onPost).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[aria-label="Efetivar lançamento pendente"]')).toHaveLength(1);
  });

  it("não permite efetivar lançamentos já realizados ou sem callback", () => {
    const onPost = vi.fn();
    const { rerender } = render(<TransactionItem {...base} transaction_status="posted" onPost={onPost} />);
    expect(screen.queryByRole("button", { name: "Efetivar lançamento pendente" })).toBeNull();
    rerender(<TransactionItem {...base} onPost={undefined} />);
    expect(screen.queryByRole("button", { name: "Efetivar lançamento pendente" })).toBeNull();
  });

  it("mantém ação para uma transação pendente sem data da compra", () => {
    const onPost = vi.fn();
    render(<TransactionItem {...base} purchase_date={null} onPost={onPost} />);
    fireEvent.click(screen.getByRole("button", { name: "Efetivar lançamento pendente" }));
    expect(onPost).toHaveBeenCalledTimes(1);
  });
});
