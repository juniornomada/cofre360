import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { InvoiceEmptyState } from "@/components/cards/InvoiceEmptyState";

const baseProps = {
  startDate: new Date("2026-07-01T00:00:00"),
  endDate: new Date("2026-07-31T00:00:00"),
  cardName: "Porto Bank",
  canGoPrev: true,
  onAdd: () => {},
  onPrev: () => {},
};

describe("InvoiceEmptyState a11y", () => {
  it("expõe o container como live region status polite/atomic com labelledby+describedby", () => {
    const { container } = render(<InvoiceEmptyState {...baseProps} />);
    const region = container.querySelector('[role="status"]') as HTMLElement;
    expect(region).toBeTruthy();
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    const labelledby = region.getAttribute("aria-labelledby")!;
    const describedby = region.getAttribute("aria-describedby")!;
    expect(document.getElementById(labelledby)?.textContent).toMatch(
      /nenhuma transação|somente pagamentos/i,
    );
    expect(document.getElementById(describedby)?.textContent).toMatch(/\d{2}\/\d{2}/);
  });

  it("ícones decorativos estão marcados como aria-hidden", () => {
    const { container } = render(<InvoiceEmptyState {...baseProps} />);
    container.querySelectorAll("svg").forEach((svg) => {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("ambos os botões têm nome acessível visível e são operáveis por teclado", async () => {
    const onAdd = vi.fn();
    const onPrev = vi.fn();
    const user = userEvent.setup();
    render(<InvoiceEmptyState {...baseProps} onAdd={onAdd} onPrev={onPrev} />);

    const addBtn = screen.getByRole("button", { name: /adicionar transação/i });
    const prevBtn = screen.getByRole("button", { name: /ver fatura anterior/i });

    // Ordem de tab
    await user.tab();
    expect(addBtn).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(prevBtn).toHaveFocus();
    await user.keyboard(" ");
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("desabilita 'ver fatura anterior' com disabled + aria-disabled quando não há anterior", () => {
    render(<InvoiceEmptyState {...baseProps} canGoPrev={false} />);
    const prevBtn = screen.getByRole("button", { name: /ver fatura anterior/i });
    expect(prevBtn).toBeDisabled();
    expect(prevBtn.getAttribute("aria-disabled")).toBe("true");
  });

  it("alvos de toque atendem min 44x44 (min-h-11 min-w-11)", () => {
    render(<InvoiceEmptyState {...baseProps} />);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.className).toMatch(/min-h-11/);
      expect(btn.className).toMatch(/min-w-11/);
    }
  });

  it("axe: sem violações no modo empty e no modo payments-only", async () => {
    const empty = render(<InvoiceEmptyState {...baseProps} />);
    expect(await axe(empty.container)).toHaveNoViolations();
    empty.unmount();

    const paymentsOnly = render(
      <InvoiceEmptyState {...baseProps} paymentsCount={2} />,
    );
    expect(await axe(paymentsOnly.container)).toHaveNoViolations();
  });
});
