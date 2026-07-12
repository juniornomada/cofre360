import { describe, it, expect } from "vitest";
import { sortInvoiceChronoAsc, type ChronoSortable } from "@/lib/invoice-chrono-sort";
import { resolveInvoiceOrder } from "@/lib/invoice-order-snapshot";

/**
 * Cenário: múltiplos lançamentos criados na MESMA data (mesmo `date`), com
 * created_at e id variados. Simula refetches e edições sucessivas (típicos
 * de /cards ao editar categoria/valor no diálogo aberto) e valida que a
 * ordem visível permanece estável.
 */

const tx = (
  id: string,
  date: string,
  created_at: string,
): ChronoSortable => ({ id, date, created_at });

describe("Cards /cards — mesma data: estabilidade após refetch e edições", () => {
  // Todos em 10/07/2026, alguns com o mesmo created_at para exercitar o
  // desempate final por id.
  const baseline = [
    tx("m", "10/07", "2026-07-10T09:00:00Z"),
    tx("a", "10/07", "2026-07-10T09:00:00Z"), // empate total com "m" e "z"
    tx("z", "10/07", "2026-07-10T09:00:00Z"),
    tx("k", "10/07", "2026-07-10T10:30:00Z"),
    tx("b", "10/07", "2026-07-10T08:00:00Z"),
  ];

  it("ordem inicial obedece (created_at asc, depois id localeCompare)", () => {
    // b (08h) < a=m=z (09h → id: a,m,z) < k (10h30)
    expect(sortInvoiceChronoAsc(baseline).map((t) => t.id)).toEqual([
      "b",
      "a",
      "m",
      "z",
      "k",
    ]);
  });

  it("refetch com payload embaralhado do servidor não muda a ordem visível", () => {
    const first = sortInvoiceChronoAsc(baseline).map((t) => t.id);

    // Snapshot capturado na primeira renderização (dialog abriu).
    const { nextSnapshot: snap1 } = resolveInvoiceOrder({
      currentIds: first,
      priorSnapshot: undefined,
      dialogOpen: true,
    });

    // Servidor devolve os mesmos itens em ordem arbitrária.
    const shuffled = [baseline[2], baseline[4], baseline[0], baseline[3], baseline[1]];
    const refetched = sortInvoiceChronoAsc(shuffled).map((t) => t.id);

    const { orderedIds } = resolveInvoiceOrder({
      currentIds: refetched,
      priorSnapshot: snap1 ?? undefined,
      dialogOpen: true,
    });

    expect(orderedIds).toEqual(first);
  });

  it("edição de campo cosmético (categoria) não reordena a lista", () => {
    // Simula: usuário edita a categoria de "m". O comparador não usa
    // categoria, então a sequência ordenada continua idêntica.
    const edited = baseline.map((t) =>
      t.id === "m" ? { ...t } : t,
    );
    const before = sortInvoiceChronoAsc(baseline).map((t) => t.id);
    const after = sortInvoiceChronoAsc(edited).map((t) => t.id);
    expect(after).toEqual(before);
  });

  it("exclusão de um item mantém a ordem relativa dos restantes", () => {
    const first = sortInvoiceChronoAsc(baseline).map((t) => t.id);
    const { nextSnapshot: snap } = resolveInvoiceOrder({
      currentIds: first,
      priorSnapshot: undefined,
      dialogOpen: true,
    });

    // Usuário exclui "m".
    const remaining = baseline.filter((t) => t.id !== "m");
    const refetched = sortInvoiceChronoAsc(remaining).map((t) => t.id);

    const { orderedIds } = resolveInvoiceOrder({
      currentIds: refetched,
      priorSnapshot: snap ?? undefined,
      dialogOpen: true,
    });

    expect(orderedIds).toEqual(["b", "a", "z", "k"]);
  });

  it("novo lançamento na mesma data entra no FIM (não intercala prefixo congelado)", () => {
    const first = sortInvoiceChronoAsc(baseline).map((t) => t.id);
    const { nextSnapshot: snap } = resolveInvoiceOrder({
      currentIds: first,
      priorSnapshot: undefined,
      dialogOpen: true,
    });

    // Novo item "c" chega em 10/07 09:00 — pelo comparador puro entraria
    // entre "b" e "k"; mas com o diálogo aberto ele deve ir para o final.
    const withNew = [
      ...baseline,
      tx("c", "10/07", "2026-07-10T09:00:00Z"),
    ];
    const refetched = sortInvoiceChronoAsc(withNew).map((t) => t.id);

    const { orderedIds } = resolveInvoiceOrder({
      currentIds: refetched,
      priorSnapshot: snap ?? undefined,
      dialogOpen: true,
    });

    expect(orderedIds).toEqual(["b", "a", "m", "z", "k", "c"]);
  });

  it("edição sucessiva com refetches intercalados: ordem permanece estável (idempotência)", () => {
    let snap: string[] | undefined = undefined;
    const first = sortInvoiceChronoAsc(baseline).map((t) => t.id);

    for (let i = 0; i < 5; i++) {
      // Cada iteração simula um refetch com payload embaralhado.
      const shuffled = [...baseline].reverse();
      const refetched = sortInvoiceChronoAsc(shuffled).map((t) => t.id);
      const result = resolveInvoiceOrder({
        currentIds: refetched,
        priorSnapshot: snap,
        dialogOpen: true,
      });
      snap = result.nextSnapshot ?? undefined;
      expect(result.orderedIds).toEqual(first);
    }
  });

  it("empate total (mesma date + mesmo created_at): desempate por id é estável entre refetches", () => {
    const trio = [
      tx("zeta", "10/07", "2026-07-10T09:00:00Z"),
      tx("alpha", "10/07", "2026-07-10T09:00:00Z"),
      tx("mike", "10/07", "2026-07-10T09:00:00Z"),
    ];
    const expected = ["alpha", "mike", "zeta"];
    // Ordena partindo de várias permutações do servidor.
    const permutations = [
      [trio[0], trio[1], trio[2]],
      [trio[2], trio[1], trio[0]],
      [trio[1], trio[0], trio[2]],
    ];
    for (const perm of permutations) {
      expect(sortInvoiceChronoAsc(perm).map((t) => t.id)).toEqual(expected);
    }
  });
});
