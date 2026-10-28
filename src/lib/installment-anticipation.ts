import { parseTxDate, type CardTransaction, type InvoicePeriod } from "@/lib/invoice-utils";

/**
 * This operation only reassigns the billing DATE of existing installment rows.
 * It does not pay a card statement, change the purchase date, replace the
 * installments, or change their values and identifiers.
 */
export type AnticipationMove = {
  id: string;
  number: number;
  amount: number;
  originalDate: string;
};

export type AnticipationPlan = {
  targetDate: string;
  moves: AnticipationMove[];
  totalAmount: number;
  available: number;
};

const localIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function validateAnticipationGroup(
  rows: CardTransaction[],
  selected: CardTransaction,
  cardName: string,
): string | null {
  const total = Number(selected.total_installments);
  if (!selected.installment_group_id || !Number.isInteger(total) || total < 2 || total > 48) {
    return "Esta compra não possui um parcelamento completo identificado.";
  }
  if (rows.length !== total) {
    return "O histórico da compra está incompleto. Nenhuma parcela foi alterada.";
  }
  const numbers = new Set<number>();
  for (const row of rows) {
    const number = Number(row.installment_number);
    if (
      row.installment_group_id !== selected.installment_group_id ||
      row.card !== cardName ||
      row.type !== "expense" ||
      Number(row.total_installments) !== total ||
      !Number.isInteger(number) ||
      number < 1 || number > total ||
      numbers.has(number) ||
      !Number.isFinite(Number(row.amount)) ||
      Number(row.amount) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        !/^\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{4})?$/.test(row.date) &&
        !/^\d{1,2}\s+[a-zçãéêíóú.]+(?:\s+\d{4})?$/i.test(row.date)
    ) {
      return "As parcelas não estão consistentes. Verifique o lançamento antes de antecipar.";
    }
    numbers.add(number);
  }
  if (!rows.some((r) => r.id === selected.id)) {
    return "A parcela escolhida não pertence mais a este parcelamento.";
  }
  return null;
}

export function buildAnticipationPlan(
  rows: CardTransaction[],
  selected: CardTransaction,
  cardName: string,
  period: Pick<InvoicePeriod, "startDate" | "endDate">,
  count: number,
  now: Date = new Date(),
): AnticipationPlan {
  const error = validateAnticipationGroup(rows, selected, cardName);
  if (error) throw new Error(error);
  if (period.endDate.getTime() <= now.getTime()) {
    throw new Error("A fatura de destino já fechou. Selecione uma fatura aberta ou futura.");
  }
  if (!Number.isInteger(count) || count < 1) throw new Error("Informe ao menos uma parcela.");

  const selectedNumber = Number(selected.installment_number);
  // A selected installment and any subsequent installments may be moved,
  // provided their current billing cycle occurs AFTER the target cycle.
  const candidates = rows
    .filter((row) => Number(row.installment_number) >= selectedNumber)
    .filter((row) => parseTxDate(row.date, row.created_at).getTime() >= period.endDate.getTime())
    .sort((a, b) => Number(a.installment_number) - Number(b.installment_number));

  if (candidates.length === 0) {
    throw new Error("Não há parcelas futuras desta compra para antecipar nessa fatura.");
  }
  if (count > candidates.length) {
    throw new Error("A quantidade excede as parcelas futuras disponíveis.");
  }
  const targetDay = now >= period.startDate && now < period.endDate
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(period.startDate.getFullYear(), period.startDate.getMonth(), period.startDate.getDate() + 1);
  if (targetDay >= period.endDate) {
    throw new Error("Não foi possível identificar uma data válida para a fatura de destino.");
  }
  const moves = candidates.slice(0, count).map(row => ({
    id: row.id,
    number: Number(row.installment_number),
    amount: Number(row.amount),
    originalDate: row.date,
  }));
  return {
    targetDate: localIso(targetDay),
    moves,
    totalAmount: Math.round(moves.reduce((sum, m) => sum + Math.round(m.amount * 100), 0)) / 100,
    available: candidates.length,
  };
}

/** Guards against stale invoice data before persisting a pre-confirmed plan. */
export function isSameAnticipationPlan(expected: AnticipationPlan, current: AnticipationPlan): boolean {
  return expected.targetDate === current.targetDate &&
    expected.moves.length === current.moves.length &&
    expected.moves.every((move, i) => {
      const updated = current.moves[i];
      return updated.id === move.id &&
        updated.number === move.number &&
        updated.originalDate === move.originalDate &&
        Math.round(updated.amount * 100) === Math.round(move.amount * 100);
    });
}
