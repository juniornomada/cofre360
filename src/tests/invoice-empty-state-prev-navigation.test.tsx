import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoiceEmptyState } from "@/components/cards/InvoiceEmptyState";

/**
 * Harness que simula o pai (cards.tsx) navegando entre períodos de fatura.
 * periods[0] é a mais antiga visível; incrementar idx vai para faturas mais novas,
 * decrementar vai para a "fatura anterior" (mais antiga).
 */
function Harness({
  periods,
  onNavigate,
}: {
  periods: { startDate: Date; endDate: Date }[];
  onNavigate?: (idx: number) => void;
}) {
  const [idx, setIdx] = useState(periods.length - 1); // começa na mais nova
  const p = periods[idx];
  return (
    <>
      <div data-testid="idx">{idx}</div>
      <InvoiceEmptyState
        startDate={p.startDate}
        endDate={p.endDate}
        cardName="Porto Bank"
        canGoPrev={idx > 0}
        onAdd={() => {}}
        onPrev={() => {
          const next = Math.max(0, idx - 1);
          setIdx(next);
          onNavigate?.(next);
        }}
      />
    </>
  );
}

const P0 = { startDate: new Date(2026, 4, 1), endDate: new Date(2026, 4, 31) }; // mai
const P1 = { startDate: new Date(2026, 5, 1), endDate: new Date(2026, 5, 30) }; // jun
const P2 = { startDate: new Date(2026, 6, 1), endDate: new Date(2026, 6, 31) }; // jul

describe("InvoiceEmptyState — botão 'Ver fatura anterior'", () => {
  it("fica desabilitado quando estamos na fatura mais antiga (idx=0)", () => {
    render(
      <InvoiceEmptyState
        startDate={P0.startDate}
        endDate={P0.endDate}
        cardName="Porto Bank"
        canGoPrev={false}
        onAdd={() => {}}
        onPrev={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /ver fatura anterior/i });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("não dispara onPrev nem por clique nem por teclado quando desabilitado", async () => {
    const onPrev = vi.fn();
    const user = userEvent.setup();
    render(
      <InvoiceEmptyState
        startDate={P0.startDate}
        endDate={P0.endDate}
        cardName="Porto Bank"
        canGoPrev={false}
        onAdd={() => {}}
        onPrev={onPrev}
      />,
    );
    const btn = screen.getByRole("button", { name: /ver fatura anterior/i });
    await user.click(btn);
    btn.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("está habilitado e navega para a fatura anterior quando idx > 0", async () => {
    const nav = vi.fn();
    const user = userEvent.setup();
    render(<Harness periods={[P0, P1, P2]} onNavigate={nav} />);

    // começa em idx=2 (julho)
    expect(screen.getByTestId("idx").textContent).toBe("2");
    expect(screen.getByText(/01\/07.*31\/07|31\/07/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /ver fatura anterior/i }));
    expect(nav).toHaveBeenLastCalledWith(1);
    expect(screen.getByTestId("idx").textContent).toBe("1");
    // agora exibe junho
    expect(screen.getByText(/30\/06/)).toBeTruthy();
  });

  it("navega em cascata até idx=0 e então fica desabilitado", async () => {
    const user = userEvent.setup();
    render(<Harness periods={[P0, P1, P2]} />);

    const btn = () => screen.getByRole("button", { name: /ver fatura anterior/i });

    await user.click(btn()); // 2 → 1
    await user.click(btn()); // 1 → 0
    expect(screen.getByTestId("idx").textContent).toBe("0");
    expect(btn()).toBeDisabled();

    // clique adicional é ignorado (botão desabilitado)
    await user.click(btn());
    expect(screen.getByTestId("idx").textContent).toBe("0");
  });

  it("com um único período, o botão nasce desabilitado", () => {
    render(<Harness periods={[P0]} />);
    expect(screen.getByTestId("idx").textContent).toBe("0");
    expect(screen.getByRole("button", { name: /ver fatura anterior/i })).toBeDisabled();
  });
});
