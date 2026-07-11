import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvoiceEmptyState } from "@/components/cards/InvoiceEmptyState";

const start = new Date(2026, 6, 3);  // 03/07
const end = new Date(2026, 7, 3);    // 03/08

describe("InvoiceEmptyState", () => {
  it("renders the 'Nenhuma transação neste período' message", () => {
    render(
      <InvoiceEmptyState
        startDate={start}
        endDate={end}
        cardName="Porto Bank"
        canGoPrev
        onAdd={() => {}}
        onPrev={() => {}}
      />
    );
    expect(screen.getByText("Nenhuma transação neste período")).toBeInTheDocument();
  });

  it("exposes an accessible live region (role=status, aria-live=polite)", () => {
    render(
      <InvoiceEmptyState
        startDate={start}
        endDate={end}
        cardName="Porto Bank"
        canGoPrev
        onAdd={() => {}}
        onPrev={() => {}}
      />
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Nenhuma transação neste período");
  });

  it("shows the period range and card name in the subtext", () => {
    render(
      <InvoiceEmptyState
        startDate={start}
        endDate={end}
        cardName="Porto Bank"
        canGoPrev
        onAdd={() => {}}
        onPrev={() => {}}
      />
    );
    expect(
      screen.getByText(/Não há lançamentos entre 03\/07 e 03\/08 para Porto Bank\./)
    ).toBeInTheDocument();
  });

  it("omits the card suffix when cardName is not provided", () => {
    render(
      <InvoiceEmptyState
        startDate={start}
        endDate={end}
        canGoPrev={false}
        onAdd={() => {}}
        onPrev={() => {}}
      />
    );
    expect(screen.getByText(/Não há lançamentos entre 03\/07 e 03\/08\./)).toBeInTheDocument();
    expect(screen.queryByText(/para /)).not.toBeInTheDocument();
  });

  it("disables 'Ver fatura anterior' when canGoPrev=false", () => {
    render(
      <InvoiceEmptyState
        startDate={start}
        endDate={end}
        cardName="X"
        canGoPrev={false}
        onAdd={() => {}}
        onPrev={() => {}}
      />
    );
    const btn = screen.getByRole("button", { name: /Ver fatura anterior/i });
    expect(btn).toBeDisabled();
  });

  it("calls onAdd and onPrev on button clicks", () => {
    const onAdd = vi.fn();
    const onPrev = vi.fn();
    render(
      <InvoiceEmptyState
        startDate={start}
        endDate={end}
        cardName="X"
        canGoPrev
        onAdd={onAdd}
        onPrev={onPrev}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Adicionar transação/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ver fatura anterior/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });
});
