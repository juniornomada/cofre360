import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoiceEmptyState } from "@/components/cards/InvoiceEmptyState";
import { buildAddTransactionNavArgs } from "@/lib/add-transaction-nav";

/**
 * Simula o handler real de cards.tsx: ao clicar "Adicionar transação",
 * fechamos o diálogo e navegamos para /transactions com o cartão e a
 * data do fim do período já pré-selecionados.
 */
describe("Fluxo: Adicionar transação a partir da fatura vazia", () => {
  const startDate = new Date(2026, 6, 1);
  const endDate = new Date(2026, 6, 31);

  it("dispara navigate com action=add, type=expense, card e date pré-selecionados", async () => {
    const navigate = vi.fn();
    const setDialogOpen = vi.fn();
    const cardName = "Porto Bank";
    const user = userEvent.setup();

    render(
      <InvoiceEmptyState
        startDate={startDate}
        endDate={endDate}
        cardName={cardName}
        canGoPrev
        paymentsCount={0}
        onPrev={() => {}}
        onAdd={() => {
          setDialogOpen(false);
          const args = buildAddTransactionNavArgs(cardName, endDate);
          navigate({ to: "/transactions", search: args });
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /adicionar transação/i }));

    expect(setDialogOpen).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({
      to: "/transactions",
      search: {
        action: "add",
        type: "expense",
        card: "Porto Bank",
        date: "31 jul",
      },
    });
  });

  it("na variante 'payments-only', o mesmo payload é enviado com o cartão preservado", async () => {
    const navigate = vi.fn();
    const user = userEvent.setup();

    render(
      <InvoiceEmptyState
        startDate={startDate}
        endDate={endDate}
        cardName="Nubank"
        canGoPrev={false}
        paymentsCount={3}
        onPrev={() => {}}
        onAdd={() =>
          navigate({
            to: "/transactions",
            search: buildAddTransactionNavArgs("Nubank", endDate),
          })
        }
      />,
    );

    // Confirma que estamos na variante correta antes de clicar
    expect(screen.getByRole("status").getAttribute("data-variant")).toBe("payments-only");

    await user.click(screen.getByRole("button", { name: /adicionar transação/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/transactions",
      search: {
        action: "add",
        type: "expense",
        card: "Nubank",
        date: "31 jul",
      },
    });
  });

  it("aciona também por teclado (Enter no botão focado)", async () => {
    const navigate = vi.fn();
    const user = userEvent.setup();

    render(
      <InvoiceEmptyState
        startDate={startDate}
        endDate={endDate}
        cardName="Itaú"
        canGoPrev
        onPrev={() => {}}
        onAdd={() =>
          navigate({
            to: "/transactions",
            search: buildAddTransactionNavArgs("Itaú", endDate),
          })
        }
      />,
    );

    await user.tab(); // foca "Adicionar transação"
    expect(screen.getByRole("button", { name: /adicionar transação/i })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(navigate).toHaveBeenCalledWith({
      to: "/transactions",
      search: expect.objectContaining({
        action: "add",
        type: "expense",
        card: "Itaú",
      }),
    });
  });
});
