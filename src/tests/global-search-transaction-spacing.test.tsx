import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TransactionItem } from "@/components/TransactionItem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
});

const raia = {
  id: "raia-installment-2",
  name: "Droga Raia 2/4",
  icon: "💊",
  category: "Saúde > Farmácia",
  type: "expense" as const,
  amount: 178.15,
  date: "18-10-2026",
  created_at: "2026-10-03T12:00:00Z",
  purchase_date: "2026-10-03",
  installment_group_id: "raia-group",
  installment_number: 2,
  total_installments: 4,
  transaction_status: "pending",
};

describe("Busca de transações: layout mobile sem sobreposição", () => {
  it("coloca categoria/parcela/status numa linha e data/Efetivar noutra, sem alterar ações", () => {
    const onPost = vi.fn();
    const onEdit = vi.fn();
    const { container } = render(
      <TransactionItem {...raia} searchLayout onPost={onPost} onEdit={onEdit} />,
    );

    const badges = screen.getByTestId("search-transaction-badges");
    const actions = screen.getByTestId("search-transaction-actions");
    expect(badges).not.toBe(actions);
    expect(badges.className).toContain("flex-wrap");
    expect(actions.className).toContain("w-full");
    expect(actions.className).toContain("justify-between");
    expect(actions.className).toContain("flex-wrap");
    expect(within(badges).getByText("2/4")).toBeTruthy();
    expect(within(badges).getByText("Pendente")).toBeTruthy();
    expect(within(actions).getByText(/Compra: 03 OUT/)).toBeTruthy();
    const button = within(actions).getByRole("button", { name: "Efetivar lançamento pendente" });
    expect(button.className).toContain("shrink-0");
    expect(button.className).toContain("px-2.5");
    expect(container.firstElementChild?.className).toContain("pr-2.5");
    fireEvent.click(button);
    expect(onPost).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("não modifica o layout padrão das listas fora da busca", () => {
    const { container } = render(<TransactionItem {...raia} onPost={vi.fn()} />);
    expect(screen.queryByTestId("search-transaction-badges")).toBeNull();
    expect(screen.queryByTestId("search-transaction-actions")).toBeNull();
    expect(container.firstElementChild?.className).toContain("pr-[44px]");
    expect(screen.getByRole("button", { name: "Efetivar lançamento pendente" })).toBeTruthy();
  });

  it("mantém data e badges de parcelas já efetivadas sem botão de débito", () => {
    render(<TransactionItem {...raia} searchLayout transaction_status="posted" />);
    expect(screen.getByTestId("search-transaction-badges")).toBeTruthy();
    expect(screen.queryByText("Pendente")).toBeNull();
    expect(screen.getByText(/Compra: 03 OUT/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Efetivar lançamento pendente" })).toBeNull();
  });

  it("usa a disposição especial apenas no resultado da busca global", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/transactions.tsx"), "utf8");
    expect(source).toMatch(/return results\.map\(tx => \([\s\S]*?<TransactionItem\s+searchLayout/);
    expect(source).toContain('if (tx.transaction_status === "pending") openPostTransaction(tx);');
  });
});
