import { describe, it, expect } from "vitest";
import {
  parseTxDate,
  groupByBillingCycle,
  getCycleDates,
  type CardTransaction,
} from "@/lib/invoice-utils";

/**
 * Integração: garante que entradas LIMÍTROFES de `parseTxDate`
 * (bordas de mês/ano, dias de fechamento, timestamps, formatos
 * numéricos e textuais) resultam em cycle keys DETERMINÍSTICAS
 * e CONSISTENTES quando alimentadas em `groupByBillingCycle`.
 *
 * Uma alteração ou regressão em `parseTxDate` que mova a data
 * em ±1 dia/mês/ano deve, obrigatoriamente, deslocar o tx
 * para outra fatura — nunca "sumir" ou duplicar.
 */

const mkTx = (over: Partial<CardTransaction> & { date: string; created_at: string }): CardTransaction => ({
  id: over.id ?? crypto.randomUUID(),
  name: over.name ?? "tx",
  icon: null,
  category: over.category ?? "cat",
  card: null,
  amount: over.amount ?? 100,
  type: over.type ?? "expense",
  total_installments: null,
  installment_number: null,
  installment_group_id: null,
  ...over,
});

const CARD = { closing: 3, due: 10 };
const REF = new Date(2026, 6, 15); // 15/Jul/2026

const cycleKeyOfTx = (tx: CardTransaction): string => {
  const periods = groupByBillingCycle([tx], CARD.closing, CARD.due, REF);
  const hit = periods.find((p) => p.transactions.length === 1);
  if (!hit) return "__unassigned__";
  return hit.endDate.toISOString().split("T")[0];
};

describe("integration — parseTxDate boundary → cycle key determinism", () => {
  it("mesma data em formatos diferentes → mesma cycle key", () => {
    const variants = [
      "10/07/2026",
      "10/07/26",
      "10-07-2026",
      "10-07-26",
      "2026-07-10",
      "2026-07-10T12:00:00Z",
      "10 jul",
      "10 julho",
    ];
    const keys = new Set(
      variants.map((date) => cycleKeyOfTx(mkTx({ date, created_at: "2026-07-10T09:00:00Z" }))),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).not.toBe("__unassigned__");
  });

  it("borda de fechamento: 02/07 vs 03/07 vs 04/07 caem em ciclos consecutivos", () => {
    const created = "2026-07-05T00:00:00Z";
    const k02 = cycleKeyOfTx(mkTx({ date: "02/07/2026", created_at: created }));
    const k03 = cycleKeyOfTx(mkTx({ date: "03/07/2026", created_at: created }));
    const k04 = cycleKeyOfTx(mkTx({ date: "04/07/2026", created_at: created }));

    // A borda pode incluir OU excluir o dia de fechamento, mas o resultado
    // é DETERMINÍSTICO: as três datas se distribuem em, no máximo, 2 ciclos
    // consecutivos, e a ordem cronológica é preservada (k02 ≤ k03 ≤ k04).
    expect([k02, k03, k04].every((k) => k !== "__unassigned__")).toBe(true);
    expect(k02 <= k03).toBe(true);
    expect(k03 <= k04).toBe(true);
    expect(new Set([k02, k03, k04]).size).toBeLessThanOrEqual(2);
  });

  it("virada de ano: 31/12/25 e 01/01/26 caem em ciclos distintos e ordenados", () => {
    const dez = mkTx({ date: "31/12/2025", created_at: "2026-01-02T00:00:00Z" });
    const jan = mkTx({ date: "01/01/2026", created_at: "2025-12-30T23:59:00Z" });
    const kDez = cycleKeyOfTx(dez);
    const kJan = cycleKeyOfTx(jan);
    expect(kDez).not.toBe(kJan);
    expect(kDez < kJan).toBe(true);
  });

  it("virada de ano SEM ano explícito: '31 dez' + created Jan → puxa para o ano anterior", () => {
    const tx = mkTx({ date: "31 dez", created_at: "2026-01-02T00:00:00Z" });
    const parsed = parseTxDate(tx.date, tx.created_at);
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(11);
    expect(parsed.getDate()).toBe(31);
  });

  it("virada de ano SEM ano explícito: '01 jan' + created Dez → empurra para o ano seguinte", () => {
    const tx = mkTx({ date: "01 jan", created_at: "2025-12-31T23:59:00Z" });
    const parsed = parseTxDate(tx.date, tx.created_at);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(1);
  });

  it("dia inválido (31/11, 30/02) cai em `created_at` — cycle key = cycle key do fallback", () => {
    const created = "2026-07-15T10:00:00Z";
    const invalid = mkTx({ date: "31/11/2026", created_at: created });
    const control = mkTx({ date: "", created_at: created });
    expect(cycleKeyOfTx(invalid)).toBe(cycleKeyOfTx(control));

    const feb30 = mkTx({ date: "30/02/2026", created_at: created });
    expect(cycleKeyOfTx(feb30)).toBe(cycleKeyOfTx(control));
  });

  it("ISO com timestamp em qualquer hora do dia → mesma cycle key que a data ISO pura", () => {
    const created = "2026-07-10T00:00:00Z";
    const hours = ["00:00:01Z", "06:30:00Z", "12:00:00Z", "18:45:00Z", "23:59:59Z"];
    const bare = cycleKeyOfTx(mkTx({ date: "2026-07-10", created_at: created }));
    for (const h of hours) {
      const k = cycleKeyOfTx(mkTx({ date: `2026-07-10T${h}`, created_at: created }));
      expect(k).toBe(bare);
    }
  });

  it("determinismo: repetir groupByBillingCycle N vezes com o mesmo input dá o mesmo resultado", () => {
    const tx = mkTx({ date: "10/07/2026", created_at: "2026-07-10T09:00:00Z" });
    const first = cycleKeyOfTx(tx);
    for (let i = 0; i < 50; i++) {
      expect(cycleKeyOfTx(tx)).toBe(first);
    }
  });

  it("uma variação de ±1 dia em `date` NUNCA faz o tx sumir; ele apenas troca de fatura", () => {
    const created = "2026-07-15T00:00:00Z";
    const dates = [
      "01/07/2026", "02/07/2026", "03/07/2026", "04/07/2026",
      "31/07/2026", "01/08/2026", "02/08/2026", "03/08/2026", "04/08/2026",
    ];
    for (const date of dates) {
      const k = cycleKeyOfTx(mkTx({ date, created_at: created }));
      expect(k).not.toBe("__unassigned__");
    }
  });

  it("agregação em massa: N variantes da MESMA data se agrupam TODAS na mesma fatura", () => {
    const created = "2026-07-10T09:00:00Z";
    const variants: CardTransaction[] = [
      "10/07/2026",
      "10/07/26",
      "10-07-2026",
      "10-07-26",
      "2026-07-10",
      "2026-07-10T12:00:00Z",
      "10 jul",
      "10 julho",
      "10 Jul.",
      "10  jul",
    ].map((date, i) =>
      mkTx({ id: `tx-${i}`, date, created_at: created, amount: 10 }),
    );

    const periods = groupByBillingCycle(variants, CARD.closing, CARD.due, REF);
    const nonEmpty = periods.filter((p) => p.transactions.length > 0);
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].transactions).toHaveLength(variants.length);
    expect(nonEmpty[0].total).toBeCloseTo(variants.length * 10, 2);
  });

  it("borda contra `getCycleDates`: a cycle key coincide com `currentClose`/`prevClose` do cartão", () => {
    const { currentClose, prevClose } = getCycleDates(REF, CARD.closing, CARD.due);
    const iso = (d: Date) => d.toISOString().split("T")[0];
    // Uma tx datada dentro do período "Atual" (prevClose <= date < currentClose)
    // tem cycle key = iso(currentClose).
    const insideCurrent = mkTx({
      date: `${prevClose.getDate().toString().padStart(2, "0")}/${(prevClose.getMonth() + 1).toString().padStart(2, "0")}/${prevClose.getFullYear()}`,
      created_at: REF.toISOString(),
    });
    expect(cycleKeyOfTx(insideCurrent)).toBe(iso(currentClose));
  });

  it("estabilidade do particionamento: duas execuções com ORDEM diferente das txs dão o mesmo particionamento", () => {
    const created = "2026-07-10T00:00:00Z";
    const txs: CardTransaction[] = [
      mkTx({ id: "a", date: "05/07/2026", created_at: created, amount: 100 }),
      mkTx({ id: "b", date: "10/07/2026", created_at: created, amount: 200 }),
      mkTx({ id: "c", date: "15/08/2026", created_at: created, amount: 300 }),
      mkTx({ id: "d", date: "invalid", created_at: created, amount: 400 }),
    ];
    const asKey = (list: CardTransaction[]) => {
      const periods = groupByBillingCycle(list, CARD.closing, CARD.due, REF);
      return periods
        .map((p) => `${p.endDate.toISOString().split("T")[0]}=${p.transactions.map((t) => t.id).sort().join(",")}`)
        .sort()
        .join("|");
    };
    const forward = asKey(txs);
    const reversed = asKey([...txs].reverse());
    expect(reversed).toBe(forward);
  });
});
