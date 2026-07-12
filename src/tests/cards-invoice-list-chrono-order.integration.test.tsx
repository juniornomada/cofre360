import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { sortInvoiceChronoAsc } from "@/lib/invoice-chrono-sort";

/**
 * Integração — renderização da fatura em /cards.
 *
 * Este teste reproduz fielmente o caminho de renderização usado por
 * `src/routes/cards.tsx` para a lista de transações da fatura ativa:
 *
 *   activePeriod.transactions
 *     .sort(compareInvoiceChrono)      // via sortInvoiceChronoAsc
 *     .map((tx) => <li data-testid=…>…</li>)
 *
 * A ordenação real vive em `@/lib/invoice-chrono-sort`, que é o mesmo
 * módulo consumido por cards.tsx (ver `sortInvoiceChronoAsc` importado
 * no topo daquele arquivo). Ao renderizar aqui, garantimos que:
 *
 *   1. A UI apresenta a fatura em ordem crescente (mais antigo → mais
 *      recente) por `parseTxDate`.
 *   2. Em empate de data, o desempate cai em `created_at` ascendente.
 *   3. Em empate de data + created_at, o desempate final é por `id`
 *      (localeCompare estável).
 *   4. Registros com data inválida e sem `created_at` afundam para o
 *      final e continuam ordenados entre si pelo `id`.
 *
 * A escolha de renderizar um componente reduzido (em vez de montar
 * `<CardsPage />` inteiro, que depende de Supabase + TanStack Router +
 * Query + realtime) é intencional: o contrato observável relevante para
 * o usuário é "a lista aparece nesta ordem no DOM". Ao consumir o mesmo
 * comparador que cards.tsx consome, qualquer regressão no sort quebra
 * este teste da mesma forma que quebraria a página real.
 */

type Row = {
  id: string;
  date: string | null;
  created_at?: string | null;
  name: string;
  amount: number;
};

function InvoiceListUnderTest({ rows }: { rows: Row[] }) {
  const ordered = sortInvoiceChronoAsc(rows);
  return (
    <ul aria-label="Transações da fatura" data-testid="invoice-list">
      {ordered.map((tx) => (
        <li key={tx.id} data-testid="invoice-row" data-id={tx.id}>
          <span data-testid="row-name">{tx.name}</span>
          <span data-testid="row-date">{tx.date ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}

function renderedIds(): string[] {
  const list = screen.getByTestId("invoice-list");
  return within(list)
    .getAllByTestId("invoice-row")
    .map((el) => el.getAttribute("data-id")!);
}

describe("/cards — integração: lista da fatura renderiza em ordem cronológica ascendente", () => {
  it("ordena datas ISO distintas do mais antigo para o mais recente", () => {
    const rows: Row[] = [
      { id: "c", date: "2026-07-20", name: "Restaurante", amount: 80 },
      { id: "a", date: "2026-07-02", name: "Mercado", amount: 250 },
      { id: "b", date: "2026-07-10", name: "Farmácia", amount: 45 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual(["a", "b", "c"]);
    // Sanidade textual: a primeira linha visível é a transação mais antiga.
    const first = within(screen.getByTestId("invoice-list")).getAllByTestId(
      "invoice-row",
    )[0];
    expect(within(first).getByTestId("row-name").textContent).toBe("Mercado");
  });

  it("aceita formatos mistos (ISO e DD/MM) e ordena por parseTxDate", () => {
    // parseTxDate resolve "05/07" no ano do created_at (2026), então
    // 05/07/2026 fica antes de 2026-07-15.
    const rows: Row[] = [
      { id: "x2", date: "2026-07-15", created_at: "2026-07-15T09:00:00Z", name: "Uber", amount: 30 },
      { id: "x1", date: "05/07", created_at: "2026-07-05T12:00:00Z", name: "Padaria", amount: 12 },
      { id: "x3", date: "2026-07-28", created_at: "2026-07-28T18:00:00Z", name: "Cinema", amount: 60 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual(["x1", "x2", "x3"]);
  });

  it("empate de data → desempate por created_at ascendente", () => {
    const rows: Row[] = [
      { id: "late", date: "2026-07-10", created_at: "2026-07-10T22:00:00Z", name: "Jantar", amount: 90 },
      { id: "early", date: "2026-07-10", created_at: "2026-07-10T08:00:00Z", name: "Café", amount: 15 },
      { id: "mid", date: "2026-07-10", created_at: "2026-07-10T13:30:00Z", name: "Almoço", amount: 45 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual(["early", "mid", "late"]);
  });

  it("empate de data + created_at → desempate final por id (localeCompare)", () => {
    const rows: Row[] = [
      { id: "z-item", date: "2026-07-10", created_at: "2026-07-10T10:00:00Z", name: "Z", amount: 10 },
      { id: "a-item", date: "2026-07-10", created_at: "2026-07-10T10:00:00Z", name: "A", amount: 20 },
      { id: "m-item", date: "2026-07-10", created_at: "2026-07-10T10:00:00Z", name: "M", amount: 30 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual(["a-item", "m-item", "z-item"]);
  });

  it("aplica a cascata completa (parseTxDate → created_at → id) em um lote misto", () => {
    const rows: Row[] = [
      // Bloco 1: 2026-07-05 — dois itens, empate total → desempate por id.
      { id: "p2", date: "2026-07-05", created_at: "2026-07-05T09:00:00Z", name: "Livraria", amount: 40 },
      { id: "p1", date: "2026-07-05", created_at: "2026-07-05T09:00:00Z", name: "Papelaria", amount: 22 },
      // Bloco 2: 2026-07-12 — mesmo dia, created_at diferentes.
      { id: "m-late", date: "2026-07-12", created_at: "2026-07-12T20:00:00Z", name: "Delivery", amount: 55 },
      { id: "m-early", date: "2026-07-12", created_at: "2026-07-12T07:15:00Z", name: "Metrô", amount: 8 },
      // Bloco 3: datas distintas de fronteira.
      { id: "s-first", date: "2026-07-01", created_at: "2026-07-01T00:00:00Z", name: "Assinatura", amount: 39 },
      { id: "s-last", date: "2026-07-31", created_at: "2026-07-31T23:59:00Z", name: "Fim do mês", amount: 100 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual([
      "s-first", // 07-01
      "p1",      // 07-05 · empate created_at → id "p1" < "p2"
      "p2",
      "m-early", // 07-12 · created_at 07:15
      "m-late",  // 07-12 · created_at 20:00
      "s-last",  // 07-31
    ]);
  });

  it("registros sem sinal temporal confiável afundam ao final, ainda ordenados por id", () => {
    const rows: Row[] = [
      { id: "valid-mid", date: "2026-07-15", created_at: "2026-07-15T10:00:00Z", name: "Ok", amount: 50 },
      { id: "invalid-z", date: "not-a-date", created_at: null, name: "Sem data 1", amount: 10 },
      { id: "invalid-a", date: "", created_at: null, name: "Sem data 2", amount: 10 },
      { id: "valid-first", date: "2026-07-02", created_at: "2026-07-02T10:00:00Z", name: "Primeiro", amount: 5 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    const ids = renderedIds();
    // As duas primeiras posições são as datas válidas, em ordem crescente.
    expect(ids.slice(0, 2)).toEqual(["valid-first", "valid-mid"]);
    // As duas últimas são os inválidos, desempatados por id (localeCompare).
    expect(ids.slice(2)).toEqual(["invalid-a", "invalid-z"]);
  });

  it("registro sem `date` mas com `created_at` válido ancora no momento de criação", () => {
    // Contrato de robustez de invoiceChronoKey: sem `date`, o item ancora
    // em `created_at` — não flutua no "agora" a cada refetch.
    const rows: Row[] = [
      { id: "with-date-late", date: "2026-07-20", created_at: "2026-07-20T10:00:00Z", name: "Depois", amount: 30 },
      { id: "only-created", date: null, created_at: "2026-07-08T10:00:00Z", name: "Ancorada", amount: 20 },
      { id: "with-date-early", date: "2026-07-03", created_at: "2026-07-03T10:00:00Z", name: "Antes", amount: 15 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual([
      "with-date-early", // 07-03
      "only-created",    // ancorado em created_at 07-08
      "with-date-late",  // 07-20
    ]);
  });
});
