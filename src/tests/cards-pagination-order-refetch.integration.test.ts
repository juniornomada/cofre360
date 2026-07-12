import { describe, it, expect } from "vitest";
import { sortInvoiceChronoAsc, type ChronoSortable } from "@/lib/invoice-chrono-sort";
import { resolveInvoiceOrder } from "@/lib/invoice-order-snapshot";

/**
 * Integração — paginação / scroll infinito em /cards.
 *
 * Contrato validado:
 *  - Ao carregar páginas incrementalmente (scroll infinito) ou ao refazer o
 *    fetch de páginas já carregadas, a ordem visível permanece estável e
 *    determinística: cronológica ascendente por `parseTxDate` com desempates
 *    por `created_at` e `id`.
 *  - O snapshot de ordem (`invoiceOrderRef` em cards.tsx) preserva o prefixo
 *    congelado através de refetches, e novos itens vindos de páginas
 *    subsequentes são anexados no final na ordem cronológica do servidor —
 *    nunca reordenam o prefixo já exibido.
 *
 * O harness simula o comportamento real do componente:
 *   1. Concatena páginas na ordem que chegam do servidor.
 *   2. Aplica `sortInvoiceChronoAsc` (mesma função usada em cards.tsx).
 *   3. Passa pelo `resolveInvoiceOrder` (mesma persistência de ordem).
 */

type Row = ChronoSortable & { amount: number };

function createPagedHarness(orderKey: string) {
  const store = new Map<string, string[]>();
  let dialogOpen = false;
  const loadedPages: Row[][] = [];

  function currentServerRows(): Row[] {
    // Emula a resposta consolidada do backend após as páginas atualmente
    // carregadas serem concatenadas e ordenadas cronologicamente.
    const all = loadedPages.flat();
    return sortInvoiceChronoAsc(all);
  }

  function commit(): Row[] {
    const server = currentServerRows();
    const currentIds = server.map((r) => String(r.id));
    const prior = store.get(orderKey);
    const { orderedIds, nextSnapshot } = resolveInvoiceOrder({
      currentIds,
      priorSnapshot: prior,
      dialogOpen,
    });
    if (nextSnapshot === null) store.delete(orderKey);
    else store.set(orderKey, nextSnapshot);
    const byId = new Map(server.map((r) => [String(r.id), r]));
    return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
  }

  return {
    open() {
      dialogOpen = true;
    },
    close() {
      dialogOpen = false;
    },
    /** Carrega uma página adicional (scroll infinito). */
    loadPage(rows: Row[]): Row[] {
      loadedPages.push(rows);
      return commit();
    },
    /** Refaz o fetch das páginas já carregadas (React Query refetch). */
    refetch(mutator?: (pages: Row[][]) => Row[][]): Row[] {
      if (mutator) {
        const next = mutator(loadedPages.map((p) => p.slice()));
        loadedPages.splice(0, loadedPages.length, ...next);
      }
      return commit();
    },
  };
}

describe("/cards — paginação/scroll infinito preserva ordem estável em refetches", () => {
  it("scroll infinito: cada nova página aparece no final na ordem cronológica, prefixo permanece congelado", () => {
    const h = createPagedHarness("card1::2026-01-15");
    h.open();

    const page1: Row[] = [
      { id: "t1", date: "2026-01-03", created_at: "2026-01-03T10:00:00Z", amount: 10 },
      { id: "t2", date: "2026-01-05", created_at: "2026-01-05T10:00:00Z", amount: 20 },
      { id: "t3", date: "2026-01-07", created_at: "2026-01-07T10:00:00Z", amount: 30 },
    ];
    expect(h.loadPage(page1).map((r) => r.id)).toEqual(["t1", "t2", "t3"]);

    // Página 2 traz itens mais recentes (fluxo natural asc → mais recentes ao final).
    const page2: Row[] = [
      { id: "t4", date: "2026-01-09", created_at: "2026-01-09T10:00:00Z", amount: 40 },
      { id: "t5", date: "2026-01-11", created_at: "2026-01-11T10:00:00Z", amount: 50 },
    ];
    expect(h.loadPage(page2).map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4", "t5"]);

    // Página 3 chega fora de ordem (servidor devolveu invertido); o sort
    // cronológico deve normalizar e o snapshot preservar as posições.
    const page3: Row[] = [
      { id: "t7", date: "2026-01-15", created_at: "2026-01-15T10:00:00Z", amount: 70 },
      { id: "t6", date: "2026-01-13", created_at: "2026-01-13T10:00:00Z", amount: 60 },
    ];
    expect(h.loadPage(page3).map((r) => r.id)).toEqual([
      "t1", "t2", "t3", "t4", "t5", "t6", "t7",
    ]);
  });

  it("refetch das mesmas páginas em ordem embaralhada não muda a ordem visível", () => {
    const h = createPagedHarness("card1::2026-01-15");
    h.open();

    h.loadPage([
      { id: "t1", date: "2026-01-03", created_at: "2026-01-03T10:00:00Z", amount: 10 },
      { id: "t2", date: "2026-01-05", created_at: "2026-01-05T10:00:00Z", amount: 20 },
    ]);
    h.loadPage([
      { id: "t3", date: "2026-01-07", created_at: "2026-01-07T10:00:00Z", amount: 30 },
      { id: "t4", date: "2026-01-09", created_at: "2026-01-09T10:00:00Z", amount: 40 },
    ]);

    // Refetch 1: servidor troca ordem interna das páginas e a ordem dos lotes.
    const r1 = h.refetch((pages) => {
      const flat = pages.flat();
      return [flat.slice(2).reverse(), flat.slice(0, 2).reverse()];
    });
    expect(r1.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4"]);

    // Refetch 2: permutação total.
    const r2 = h.refetch((pages) => {
      const flat = pages.flat();
      return [[flat[3], flat[0]], [flat[2], flat[1]]];
    });
    expect(r2.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("desempate: mesma data → created_at → id; refetch preserva desempates", () => {
    const h = createPagedHarness("card1::2026-01-15");
    h.open();

    // Todos no mesmo dia; desempatam por created_at, depois por id.
    const day = "2026-01-10";
    h.loadPage([
      { id: "b", date: day, created_at: "2026-01-10T12:00:00Z", amount: 20 },
      { id: "a", date: day, created_at: "2026-01-10T12:00:00Z", amount: 10 }, // mesmo created_at → id
      { id: "c", date: day, created_at: "2026-01-10T14:00:00Z", amount: 30 },
    ]);
    // Esperado: [a, b] (mesmo timestamp, id asc), depois c (created_at mais tarde).
    const first = h.refetch();
    expect(first.map((r) => r.id)).toEqual(["a", "b", "c"]);

    // Refetch com ordem embaralhada preserva o desempate.
    const shuffled = h.refetch((pages) => [pages[0].slice().reverse()]);
    expect(shuffled.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("itens sem data válida afundam ao final e mantêm ordem estável entre refetches", () => {
    const h = createPagedHarness("card1::2026-01-15");
    h.open();

    h.loadPage([
      { id: "t1", date: "2026-01-03", created_at: "2026-01-03T10:00:00Z", amount: 10 },
      { id: "z-noop", date: "", created_at: null, amount: 0 },
      { id: "t2", date: "2026-01-05", created_at: "2026-01-05T10:00:00Z", amount: 20 },
      { id: "a-noop", date: null, created_at: null, amount: 0 },
    ]);
    const initial = h.refetch();
    // Válidos primeiro em ordem cronológica; inválidos ao final ordenados por id.
    expect(initial.map((r) => r.id)).toEqual(["t1", "t2", "a-noop", "z-noop"]);

    // Vários refetches consecutivos com ordens diferentes do servidor.
    for (let i = 0; i < 5; i++) {
      const r = h.refetch((pages) => [pages[0].slice().reverse()]);
      expect(r.map((row) => row.id)).toEqual(["t1", "t2", "a-noop", "z-noop"]);
    }
  });

  it("página adicional carregada com item cuja data cai dentro do prefixo já exibido → anexa ao final (snapshot vence sort)", () => {
    const h = createPagedHarness("card1::2026-01-15");
    h.open();

    h.loadPage([
      { id: "t1", date: "2026-01-03", created_at: "2026-01-03T10:00:00Z", amount: 10 },
      { id: "t2", date: "2026-01-10", created_at: "2026-01-10T10:00:00Z", amount: 20 },
      { id: "t3", date: "2026-01-20", created_at: "2026-01-20T10:00:00Z", amount: 30 },
    ]);

    // Nova página traz um item retroativo (data no meio do intervalo).
    const withNewcomer = h.loadPage([
      { id: "tX", date: "2026-01-05", created_at: "2026-01-30T10:00:00Z", amount: 15 },
    ]);
    // O snapshot congela o prefixo original; o recém-chegado vai ao final.
    expect(withNewcomer.map((r) => r.id)).toEqual(["t1", "t2", "t3", "tX"]);

    // Refetch: reforça a estabilidade — nada reordena.
    const again = h.refetch();
    expect(again.map((r) => r.id)).toEqual(["t1", "t2", "t3", "tX"]);
  });

  it("stress: 20 refetches com permutações determinísticas mantêm a ordem cronológica esperada", () => {
    const h = createPagedHarness("card1::2026-01-15");
    h.open();

    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      id: `t${String(i + 1).padStart(2, "0")}`,
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      created_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      amount: (i + 1) * 10,
    }));
    // Carrega em 3 páginas.
    h.loadPage(rows.slice(0, 4));
    h.loadPage(rows.slice(4, 8));
    h.loadPage(rows.slice(8, 12));
    const canonical = rows.map((r) => String(r.id));

    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 20; i++) {
      const visible = h.refetch((pages) => {
        const flat = pages.flat().sort(() => rand() - 0.5);
        return [flat.slice(0, 4), flat.slice(4, 8), flat.slice(8, 12)];
      });
      expect(visible.map((r) => String(r.id))).toEqual(canonical);
    }
  });
});
