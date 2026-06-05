import { DateTime } from 'luxon';

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

export function groupByBillingCycle(txs: CardTransaction[], closingDay: number | null, dueDay: number | null): InvoicePeriod[] {
  const cDay = closingDay || 1;
  const dDay = dueDay || 10;
  const userZone = 'America/Sao_Paulo';
  const now = DateTime.now().setZone(userZone);

  // We want to determine the "next" closing date relative to today.
  let closingDate = now.set({ day: cDay, hour: 0, minute: 0, second: 0, millisecond: 0 });
  if (now > closingDate) {
    closingDate = closingDate.plus({ months: 1 });
  }

  const prevClosing = closingDate.minus({ months: 1 });
  const pastClosing = prevClosing.minus({ months: 1 });

  const makeDue = (closing: DateTime) => {
    let d = closing.set({ day: dDay });
    if (d <= closing) d = d.plus({ months: 1 });
    return d.toJSDate();
  };

  // Find the max future date from all transactions
  let maxFutureDate = now;
  for (const tx of txs) {
    const txDate = DateTime.fromJSDate(parseTxDate(tx.date, tx.created_at)).setZone(userZone);
    if (txDate > maxFutureDate) maxFutureDate = txDate;
  }

  const formatLabel = (prefix: string, endDate: DateTime) =>
    `${prefix} (${monthNames[endDate.month - 1]}/${endDate.year.toString().slice(2)})`;

  const periods: InvoicePeriod[] = [
    { 
      label: formatLabel("Anterior", prevClosing), 
      key: "past", 
      startDate: pastClosing.toJSDate(), 
      endDate: prevClosing.toJSDate(), 
      dueDate: makeDue(prevClosing), 
      transactions: [], 
      total: 0 
    },
    { 
      label: formatLabel("Atual", closingDate), 
      key: "current", 
      startDate: prevClosing.toJSDate(), 
      endDate: closingDate.toJSDate(), 
      dueDate: makeDue(closingDate), 
      transactions: [], 
      total: 0 
    },
  ];

  let futureStart = closingDate;
  let futureIndex = 0;
  while (futureStart < maxFutureDate || futureIndex === 0) {
    const futureEnd = futureStart.plus({ months: 1 }).set({ day: cDay });
    periods.push({
      label: formatLabel("Próxima", futureEnd),
      key: `future_${futureIndex}`,
      startDate: futureStart.toJSDate(),
      endDate: futureEnd.toJSDate(),
      dueDate: makeDue(futureEnd),
      transactions: [],
      total: 0,
    });
    futureStart = futureEnd;
    futureIndex++;
    if (futureIndex > 24) break;
  }

  // Place each transaction
  for (const tx of txs) {
    const txJSDate = parseTxDate(tx.date, tx.created_at);
    const txTime = txJSDate.getTime();

    let periodIdx = -1;
    for (let pi = 0; pi < periods.length; pi++) {
      if (txTime >= periods[pi].startDate.getTime() && txTime < periods[pi].endDate.getTime()) {
        periodIdx = pi;
        break;
      }
    }
    if (periodIdx === -1) continue;

    periods[periodIdx].transactions.push(tx);
    periods[periodIdx].total += Number(tx.amount);
  }

  return periods.filter((p, i) => i < 2 || p.transactions.length > 0);
}
