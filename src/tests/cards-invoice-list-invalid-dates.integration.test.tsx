import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { sortInvoiceChronoAsc } from "@/lib/invoice-chrono-sort";

/**
 * Integração — /cards fatura: robustez contra datas inválidas / ausentes.
 *
 * Cenário coberto: `parseTxDate` retorna algo indefinido/inválido para
 * uma parcela das linhas da fatura (string vazia, `null`, `undefined`,
 * texto sem formato reconhecido, ISO malformado, dia inexistente para o
 * mês, unicode zero-width, etc.). O contrato observável para o usuário:
 *
 *   1. A lista continua renderizando — nenhuma exceção quebra a UI.
 *   2. Todas as linhas de entrada aparecem no DOM (nenhum item é
 *      silenciosamente descartado).
 *   3. Datas válidas ficam na frente em ordem crescente.
 *   4. Linhas com data inválida E sem `created_at` afundam ao final,
 *      desempatadas de forma estável por `id` (`localeCompare`).
 *   5. Linhas com data inválida MAS com `created_at` válido são ancoradas
 *      na linha do tempo pelo `created_at` (não flutuam no "agora").
 *   6. A ordem é reprodutível entre renders (determinismo — importante
 *      para o snapshot de ordem preservado em `invoiceOrderRef`).
 *
 * Este teste consome o mesmo `sortInvoiceChronoAsc` importado por
 * `src/routes/cards.tsx`, então qualquer regressão em `invoiceChronoKey`
 * / `compareInvoiceChrono` quebra este teste igualzinho quebraria a
 * lista da fatura em produção.
 */

type Row = {
  id: string;
  date: string | null | undefined;
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

describe("/cards — integração: fatura com datas inválidas mantém ordem determinística sem quebrar a UI", () => {
  it("renderiza todas as linhas mesmo quando parte das datas é `null`, `undefined` ou string vazia", () => {
    const rows: Row[] = [
      { id: "ok-1", date: "2026-07-05", created_at: "2026-07-05T09:00:00Z", name: "Mercado", amount: 100 },
      { id: "nul", date: null, created_at: null, name: "Sem data (null)", amount: 10 },
      { id: "und", date: undefined, created_at: null, name: "Sem data (undef)", amount: 11 },
      { id: "emp", date: "", created_at: null, name: "Sem data (vazio)", amount: 12 },
      { id: "ok-2", date: "2026-07-18", created_at: "2026-07-18T09:00:00Z", name: "Farmácia", amount: 50 },
    ];

    // Não deve lançar em nenhuma etapa (parse, sort, render).
    expect(() => render(<InvoiceListUnderTest rows={rows} />)).not.toThrow();

    const ids = renderedIds();
    expect(ids).toHaveLength(rows.length); // nenhum item é descartado
    expect(ids.slice(0, 2)).toEqual(["ok-1", "ok-2"]); // válidos em ordem crescente
    // Inválidos ao final, estabilidade final por id via localeCompare.
    expect(ids.slice(2)).toEqual(["emp", "nul", "und"]);
  });

  it("data textual sem formato reconhecido (parseTxDate cai no fallback) não flutua ao final", () => {
    // "hoje", "amanhã", texto arbitrário, ISO truncado — nenhum é
    // parseável por parseTxDate; sem created_at eles devem afundar.
    const rows: Row[] = [
      { id: "valid-b", date: "2026-07-12", created_at: "2026-07-12T10:00:00Z", name: "Uber", amount: 30 },
      { id: "junk-c", date: "hoje", created_at: null, name: "Rótulo humano", amount: 5 },
      { id: "junk-a", date: "amanhã", created_at: null, name: "Outro rótulo", amount: 6 },
      { id: "junk-b", date: "2026-", created_at: null, name: "ISO truncado", amount: 7 },
      { id: "valid-a", date: "2026-07-01", created_at: "2026-07-01T10:00:00Z", name: "Assinatura", amount: 40 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    const ids = renderedIds();
    // Válidos primeiro, ordem cronológica.
    expect(ids.slice(0, 2)).toEqual(["valid-a", "valid-b"]);
    // Inválidos ao final, desempate por id (localeCompare):
    // "junk-a" < "junk-b" < "junk-c".
    expect(ids.slice(2)).toEqual(["junk-a", "junk-b", "junk-c"]);
  });

  it("dia inexistente no mês (ex.: 31 fev, 31 nov) é tratado como inválido — parseTxDate rejeita overflow", () => {
    // O contrato de `parseTxDate` rejeita `day > daysInMonth(year, m)`
    // para evitar rolagem silenciosa (new Date(y,1,31) → março). Sem
    // created_at, essas linhas devem cair para o final.
    const rows: Row[] = [
      { id: "ok", date: "2026-07-10", created_at: "2026-07-10T10:00:00Z", name: "Ok", amount: 20 },
      { id: "bad-nov", date: "31 nov", created_at: null, name: "31 novembro", amount: 1 },
      { id: "bad-feb", date: "31 fev", created_at: null, name: "31 fevereiro", amount: 2 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    const ids = renderedIds();
    expect(ids[0]).toBe("ok");
    // Overflow → afunda; desempate por id: "bad-feb" < "bad-nov".
    expect(ids.slice(1)).toEqual(["bad-feb", "bad-nov"]);
  });

  it("data inválida MAS `created_at` válido ancora a linha pelo created_at (não flutua)", () => {
    const rows: Row[] = [
      { id: "late", date: "2026-07-25", created_at: "2026-07-25T10:00:00Z", name: "Fim", amount: 30 },
      // date inválido, created_at válido no meio → deve ancorar em 07-10.
      { id: "anchored", date: "not-a-date", created_at: "2026-07-10T10:00:00Z", name: "Ancorada", amount: 20 },
      { id: "early", date: "2026-07-02", created_at: "2026-07-02T10:00:00Z", name: "Início", amount: 15 },
    ];

    render(<InvoiceListUnderTest rows={rows} />);

    expect(renderedIds()).toEqual(["early", "anchored", "late"]);
  });

  it("strings com zero-width / NBSP / unicode invisível são saneadas e continuam parseáveis", () => {
    // "2026\u200B-07-15" e "10\u00A0jul" exercitam a sanitização de
    // parseTxDate (strip de \u200B, \uFEFF, NBSP, etc.). Sem quebra.
    const rows: Row[] = [
      { id: "z1", date: "2026-07-20", created_at: "2026-07-20T10:00:00Z", name: "Depois", amount: 40 },
      { id: "z2", date: "2026\u200B-07-15", created_at: "2026-07-15T10:00:00Z", name: "ZW no ISO", amount: 30 },
      { id: "z3", date: "10\u00A0jul", created_at: "2026-07-10T10:00:00Z", name: "NBSP no BR", amount: 20 },
      { id: "z4", date: "\uFEFF", created_at: null, name: "Só BOM", amount: 5 },
    ];

    expect(() => render(<InvoiceListUnderTest rows={rows} />)).not.toThrow();
    const ids = renderedIds();
    // Válidos em ordem crescente; o "só BOM" cai ao final (inválido, sem created_at).
    expect(ids.slice(0, 3)).toEqual(["z3", "z2", "z1"]);
    expect(ids[3]).toBe("z4");
  });

  it("lote 100% inválido não quebra a UI e ordena estavelmente por id", () => {
    const rows: Row[] = [
      { id: "y", date: null, created_at: null, name: "Y", amount: 1 },
      { id: "a", date: "", created_at: null, name: "A", amount: 2 },
      { id: "m", date: "lixo", created_at: null, name: "M", amount: 3 },
      { id: "b", date: undefined, created_at: null, name: "B", amount: 4 },
    ];

    expect(() => render(<InvoiceListUnderTest rows={rows} />)).not.toThrow();
    expect(renderedIds()).toEqual(["a", "b", "m", "y"]);
    // Nenhuma linha desaparece.
    expect(screen.getAllByTestId("invoice-row")).toHaveLength(rows.length);
  });

  it("ordem é reprodutível entre renders — determinismo garantido para o snapshot de ordem da fatura", () => {
    const rows: Row[] = [
      { id: "ok-b", date: "2026-07-15", created_at: "2026-07-15T10:00:00Z", name: "B", amount: 10 },
      { id: "bad-2", date: "???", created_at: null, name: "Bad2", amount: 20 },
      { id: "ok-a", date: "2026-07-03", created_at: "2026-07-03T10:00:00Z", name: "A", amount: 30 },
      { id: "bad-1", date: null, created_at: null, name: "Bad1", amount: 40 },
    ];

    const { unmount } = render(<InvoiceListUnderTest rows={rows} />);
    const firstPass = renderedIds();
    unmount();

    // Re-render com a mesma entrada em ordem embaralhada — a saída
    // do sort deve ser idêntica (o comparador é total e determinístico).
    const shuffled = [rows[3], rows[0], rows[2], rows[1]];
    render(<InvoiceListUnderTest rows={shuffled} />);
    expect(renderedIds()).toEqual(firstPass);
    expect(firstPass).toEqual(["ok-a", "ok-b", "bad-1", "bad-2"]);
  });
});
