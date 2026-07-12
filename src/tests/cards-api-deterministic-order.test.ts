import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contrato da "API" (query Supabase) usada por /cards:
 *
 *   supabase
 *     .from("transactions")
 *     .select(...)
 *     .eq("user_id", <uid>)
 *     .not("card", "is", null)
 *     .order("date",       { ascending: true, nullsFirst: false })
 *     .order("created_at", { ascending: true, nullsFirst: false })
 *     .order("id",         { ascending: true })
 *     .limit(10000);
 *
 * A cascata triple-order garante que empates de `date` sejam desempatados
 * por `created_at` e, em último caso, por `id` — resultando numa ordem
 * totalmente determinística já no servidor, antes de qualquer sort no cliente.
 *
 * Este teste valida:
 *   1) O builder da query aplica exatamente essa cascata (contrato).
 *   2) Dado um dataset com múltiplos empates na mesma `date`, a lista
 *      resultante da API é estável e determinística entre chamadas
 *      repetidas (mesmo com o servidor devolvendo os dados em qualquer
 *      ordem interna simulada).
 */

type Row = {
  id: string;
  name: string;
  date: string;
  created_at: string;
  card: string;
};

// Simula o comportamento do PostgREST aplicando a cascata de ORDER BY
// declarada no builder. Preserva os asserts do contrato: cada .order()
// registra a coluna e direção; o executor final ordena por essa cascata.
function makeFakeSupabase(dataset: Row[]) {
  const orderCalls: Array<{ column: string; ascending: boolean; nullsFirst: boolean }> = [];

  const builder: any = {
    _filters: [] as string[],
    select(_cols: string) {
      return builder;
    },
    eq(col: string, _val: unknown) {
      builder._filters.push(`eq:${col}`);
      return builder;
    },
    not(col: string, _op: string, _val: unknown) {
      builder._filters.push(`not:${col}`);
      return builder;
    },
    order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
      orderCalls.push({
        column,
        ascending: opts.ascending ?? true,
        nullsFirst: opts.nullsFirst ?? false,
      });
      return builder;
    },
    limit(_n: number) {
      // Materializa: aplica a cascata de ordenação sobre o dataset.
      const rows = dataset.slice().sort((a, b) => {
        for (const { column, ascending } of orderCalls) {
          const av = (a as any)[column];
          const bv = (b as any)[column];
          if (av === bv) continue;
          const cmp = av < bv ? -1 : 1;
          return ascending ? cmp : -cmp;
        }
        return 0;
      });
      return Promise.resolve({ data: rows, error: null });
    },
  };

  return {
    from(_table: string) {
      return builder;
    },
    __orderCalls: orderCalls,
  };
}

// Reproduz a query real do /cards (linha ~230 de src/routes/cards.tsx).
async function runCardsTransactionsQuery(supabase: ReturnType<typeof makeFakeSupabase>, userId: string) {
  return supabase
    .from("transactions")
    .select("id, name, amount, date, created_at, card, icon, category, type, total_installments, installment_number, installment_group_id")
    .eq("user_id", userId)
    .not("card", "is", null)
    .order("date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(10000);
}

describe("/cards API — ordenação determinística com empates de data", () => {
  let dataset: Row[];

  beforeEach(() => {
    // 5 lançamentos empatados em 10/01 e 2 empatados em 12/01.
    dataset = [
      { id: "c", name: "Café",   date: "2026-01-10", created_at: "2026-01-10T09:00:00Z", card: "X" },
      { id: "a", name: "Uber",   date: "2026-01-10", created_at: "2026-01-10T09:00:00Z", card: "X" },
      { id: "b", name: "Padaria",date: "2026-01-10", created_at: "2026-01-10T09:00:00Z", card: "X" },
      { id: "e", name: "Mercado",date: "2026-01-10", created_at: "2026-01-10T11:00:00Z", card: "X" },
      { id: "d", name: "Farmácia",date:"2026-01-10", created_at: "2026-01-10T10:00:00Z", card: "X" },
      { id: "g", name: "Cinema", date: "2026-01-12", created_at: "2026-01-12T20:00:00Z", card: "X" },
      { id: "f", name: "Livraria",date:"2026-01-12", created_at: "2026-01-12T20:00:00Z", card: "X" },
    ];
  });

  it("aplica a cascata order(date) → order(created_at) → order(id) exatamente uma vez cada", async () => {
    const supabase = makeFakeSupabase(dataset);
    await runCardsTransactionsQuery(supabase, "user-1");
    expect(supabase.__orderCalls).toEqual([
      { column: "date",       ascending: true, nullsFirst: false },
      { column: "created_at", ascending: true, nullsFirst: false },
      { column: "id",         ascending: true, nullsFirst: false },
    ]);
  });

  it("empates na mesma date são desempatados por created_at e depois por id", async () => {
    const supabase = makeFakeSupabase(dataset);
    const { data, error } = await runCardsTransactionsQuery(supabase, "user-1");
    expect(error).toBeNull();
    // 10/01: created_at empata em (a,b,c) → id asc; depois d (10:00), e (11:00).
    // 12/01: created_at empata (f,g) → id asc → f, g.
    expect(data!.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("ordem retornada pela API é idêntica em chamadas repetidas, independente de embaralhamentos do lado do servidor", async () => {
    const canonical = ["a", "b", "c", "d", "e", "f", "g"];
    // Executa 20 vezes com o dataset embaralhado antes de cada chamada.
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 20; i++) {
      const shuffled = dataset.slice().sort(() => rand() - 0.5);
      const supabase = makeFakeSupabase(shuffled);
      const { data } = await runCardsTransactionsQuery(supabase, "user-1");
      expect(data!.map((r) => r.id)).toEqual(canonical);
    }
  });

  it("cascata cobre o caso patológico: todos os registros no mesmo dia e mesmo created_at → desempate 100% por id", async () => {
    const sameInstant: Row[] = ["z", "m", "a", "q", "b"].map((id) => ({
      id,
      name: `tx-${id}`,
      date: "2026-01-15",
      created_at: "2026-01-15T12:00:00Z",
      card: "X",
    }));
    const supabase = makeFakeSupabase(sameInstant);
    const { data } = await runCardsTransactionsQuery(supabase, "user-1");
    expect(data!.map((r) => r.id)).toEqual(["a", "b", "m", "q", "z"]);
  });

  it("regressão: a query real em src/routes/cards.tsx contém a tríade order(date), order(created_at), order(id)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/routes/cards.tsx", "utf8");
    // A checagem estática garante que ninguém remova a cláusula do servidor
    // achando que o sort do cliente basta.
    expect(src).toMatch(/\.order\(\s*["']date["']\s*,/);
    expect(src).toMatch(/\.order\(\s*["']created_at["']\s*,/);
    expect(src).toMatch(/\.order\(\s*["']id["']\s*,/);
  });
});
