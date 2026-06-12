
export type CardTransaction = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  card?: string | null;
  date: string;
  amount: number;
  type: string;
  created_at: string;
  total_installments: number | null;
  installment_number: number | null;
  installment_group_id: string | null;
};

export type InvoicePeriod = {
  label: string;
  key: string;
  startDate: Date;
  endDate: Date;
  dueDate: Date;
  transactions: CardTransaction[];
  total: number;
};

export const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const shortMonthMap: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

export function parseTxDate(dateStr: string, fallback: string): Date {
  const parts = (dateStr || "").trim().toLowerCase().split(/\s+/);
  const fallbackDate = new Date(fallback);
  const fallbackYear = !isNaN(fallbackDate.getTime()) ? fallbackDate.getFullYear() : new Date().getFullYear();

  if (parts.length === 2) {
    const day = parseInt(parts[0]);
    const monthIdx = shortMonthMap[parts[1]];
    if (!isNaN(day) && monthIdx !== undefined) {
      return new Date(fallbackYear, monthIdx, day);
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? (!isNaN(fallbackDate.getTime()) ? fallbackDate : new Date()) : d;
}

export function getCycleDates(referenceDate: Date, closingDay: number, dueDay: number) {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const makeDue = (closing: Date) => {
    const d = new Date(closing.getFullYear(), closing.getMonth(), dDay);
    if (d <= closing) d.setMonth(d.getMonth() + 1);
    return d;
  };

  let currentClose = new Date(year, month, cDay);
  let currentDue = makeDue(currentClose);

  // If we've passed the due date, we're in the next cycle's "current" window
  if (referenceDate > currentDue) {
    currentClose = new Date(year, month + 1, cDay);
    currentDue = makeDue(currentClose);
  }

  const prevClose = new Date(currentClose.getFullYear(), currentClose.getMonth() - 1, cDay);
  return { currentClose, currentDue, prevClose, makeDue };
}

export function groupByBillingCycle(txs: CardTransaction[], closingDay: number | null, dueDay: number | null, referenceDate: Date = new Date()): InvoicePeriod[] {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const { currentClose: closingDate, prevClose: prevClosing, makeDue } = getCycleDates(referenceDate, closingDay || 1, dueDay || 10);
  const pastClosing = new Date(prevClosing.getFullYear(), prevClosing.getMonth() - 1, cDay);

  // Find the max future date from all transactions based on their actual date field
  let maxFutureDate = new Date();
  for (const tx of txs) {
    const txDate = parseTxDate(tx.date, tx.created_at);
    if (txDate > maxFutureDate) maxFutureDate = txDate;
  }

  const formatLabel = (prefix: string, endDate: Date) => {
    const dueDate = makeDue(endDate);
    return `${prefix} (F ${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')} e V ${dueDate.getDate().toString().padStart(2, '0')}/${(dueDate.getMonth() + 1).toString().padStart(2, '0')})|${endDate.toISOString().split("T")[0]}`;
  };

  const periods: InvoicePeriod[] = [
    { label: formatLabel("Anterior", prevClosing), key: "past", startDate: pastClosing, endDate: prevClosing, dueDate: makeDue(prevClosing), transactions: [], total: 0 },
    { label: formatLabel("Atual", closingDate), key: "current", startDate: prevClosing, endDate: closingDate, dueDate: makeDue(closingDate), transactions: [], total: 0 },
  ];

  let futureStart = new Date(closingDate);
  let futureIndex = 0;
  while (futureStart < maxFutureDate || futureIndex === 0) {
    const futureEnd = new Date(futureStart.getFullYear(), futureStart.getMonth() + 1, cDay);
    periods.push({
      label: formatLabel("Próxima", futureEnd),
      key: `future_${futureIndex}`,
      startDate: new Date(futureStart),
      endDate: futureEnd,
      dueDate: makeDue(futureEnd),
      transactions: [],
      total: 0,
    });
    futureStart = futureEnd;
    futureIndex++;
    if (futureIndex > 24) break;
  }

  // Place each transaction in the correct period based on its DATE field
  for (const tx of txs) {
    const txDate = parseTxDate(tx.date, tx.created_at);

    let periodIdx = -1;
    for (let pi = 0; pi < periods.length; pi++) {
      if (txDate >= periods[pi].startDate && txDate < periods[pi].endDate) {
        periodIdx = pi;
        break;
      }
    }
    if (periodIdx === -1) continue;

    periods[periodIdx].transactions.push(tx);
    if (tx.type === "income") {
      periods[periodIdx].total -= Number(tx.amount);
    } else {
      periods[periodIdx].total += Number(tx.amount);
    }
  }

  return periods.filter((p, i) => i < 2 || p.transactions.length > 0);
}
