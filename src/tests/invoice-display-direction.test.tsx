import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyInvoiceDisplayDirection,
  sortInvoiceChronoAsc,
  type InvoiceDisplayDirection,
} from "@/lib/invoice-chrono-sort";

type Row = { id: string; date: string; created_at: string; amount: number };
const rows: Row[] = [
  { id: "late", date: "2026-10-09", created_at: "2026-10-09T10:00:00Z", amount: 92.6 },
  { id: "early", date: "2026-09-03", created_at: "2026-09-03T10:00:00Z", amount: 130.5 },
  { id: "middle", date: "2026-10-06", created_at: "2026-10-06T10:00:00Z", amount: 204.42 },
];
const ids = (list: readonly Row[]) => list.map((row) => row.id);

function InvoicePreview() {
  const [direction, setDirection] = useState<InvoiceDisplayDirection>("asc");
  const snapshot = sortInvoiceChronoAsc(rows);
  const displayed = applyInvoiceDisplayDirection(snapshot, direction);
  return (
    <section>
      <div role="group" aria-label="Ordem dos lançamentos da fatura">
        <button type="button" aria-label="Mais antigos primeiro" aria-pressed={direction === "asc"} onClick={() => setDirection("asc")}>Antigos</button>
        <button type="button" aria-label="Mais recentes primeiro" aria-pressed={direction === "desc"} onClick={() => setDirection("desc")}>Recentes</button>
      </div>
      <ul aria-label="Lançamentos da fatura">
        {displayed.map((row) => <li key={row.id} data-testid="invoice-row">{row.id}</li>)}
      </ul>
      <output data-testid="invoice-total">{rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)}</output>
    </section>
  );
}

describe("Fatura — alternância de ordem de exibição", () => {
  it("ordena a base ascendente e mostra o inverso sem alterar os lançamentos", () => {
    const original = [...rows];
    const chronological = sortInvoiceChronoAsc(rows);
    expect(ids(chronological)).toEqual(["early", "middle", "late"]);
    expect(ids(applyInvoiceDisplayDirection(chronological, "desc"))).toEqual(["late", "middle", "early"]);
    expect(ids(applyInvoiceDisplayDirection(chronological, "asc"))).toEqual(["early", "middle", "late"]);
    expect(rows).toEqual(original);
    expect(ids(chronological)).toEqual(["early", "middle", "late"]);
  });

  it("inverte desempates de forma determinística e trata listas vazias", () => {
    const sameDay = sortInvoiceChronoAsc([
      { id: "b", date: "2026-10-06", created_at: "2026-10-06T10:00:00Z" },
      { id: "a", date: "2026-10-06", created_at: "2026-10-06T10:00:00Z" },
    ]);
    expect(sameDay.map((row) => row.id)).toEqual(["a", "b"]);
    expect(applyInvoiceDisplayDirection(sameDay, "desc").map((row) => row.id)).toEqual(["b", "a"]);
    expect(applyInvoiceDisplayDirection([], "desc")).toEqual([]);
  });

  it("ordem não altera os totais ou o objeto original", () => {
    const snapshot = sortInvoiceChronoAsc(rows);
    const reversed = applyInvoiceDisplayDirection(snapshot, "desc");
    expect(reversed.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(
      snapshot.reduce((sum, row) => sum + row.amount, 0),
      8,
    );
    expect(reversed[0]).toBe(snapshot[2]);
    expect(reversed).not.toBe(snapshot);
  });

  it("permite alternar pelo teclado/mouse, mantendo o total", () => {
    render(<InvoicePreview />);
    const list = screen.getByRole("list", { name: "Lançamentos da fatura" });
    const visibleIds = () => within(list).getAllByTestId("invoice-row").map((element) => element.textContent);
    const asc = screen.getByRole("button", { name: "Mais antigos primeiro" });
    const desc = screen.getByRole("button", { name: "Mais recentes primeiro" });
    expect(visibleIds()).toEqual(["early", "middle", "late"]);
    expect(asc).toHaveAttribute("aria-pressed", "true");
    const beforeTotal = screen.getByTestId("invoice-total").textContent;
    fireEvent.click(desc);
    expect(visibleIds()).toEqual(["late", "middle", "early"]);
    expect(desc).toHaveAttribute("aria-pressed", "true");
    expect(asc).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(asc);
    expect(visibleIds()).toEqual(["early", "middle", "late"]);
    expect(screen.getByTestId("invoice-total").textContent).toBe(beforeTotal);
  });

  it("a rota real aplica a direção somente na lista da fatura, não no cálculo financeiro", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");
    expect(source).toContain('data-testid="invoice-sort-controls"');
    expect(source).toContain('aria-label="Ordem dos lançamentos da fatura"');
    expect(source).toContain('aria-pressed={invoiceListDirection === "asc"}');
    expect(source).toContain('aria-pressed={invoiceListDirection === "desc"}');
    expect(source).toContain("const displayedInvoiceTransactions = applyInvoiceDisplayDirection(activePeriod?.transactions ?? [], invoiceListDirection)");
    const invoiceList = source.slice(source.indexOf('data-testid="invoice-transactions-list"'), source.indexOf('data-testid="invoice-transaction-item"'));
    expect(invoiceList).toContain("displayedInvoiceTransactions.map");
    expect(source).toContain("activePeriod.total.toLocaleString");
    expect(source).toContain("setInvoiceListDirection(\"asc\")");
  });
});
