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

  const makeDue = (closing: DateTime) => {
    let d = closing.set({ day: dDay });
    if (d <= closing) d = d.plus({ months: 1 });
    return d.toJSDate();
  };

  const formatLabel = (endDate: DateTime) => {
    const isCurrent = now <= endDate && now > endDate.minus({ months: 1 });
    const isPast = now > endDate && now <= endDate.plus({ months: 1 });
    const prefix = isCurrent ? "Atual" : isPast ? "Anterior" : endDate > now ? "Próxima" : "Antiga";
    return `${prefix} (${monthNames[endDate.month - 1]}/${endDate.year.toString().slice(2)})`;
  };

  // Find the date range of all transactions
  let minDate = now.minus({ months: 1 });
  let maxDate = now;

  for (const tx of txs) {
    const txDate = DateTime.fromJSDate(parseTxDate(tx.date, tx.created_at)).setZone(userZone);
    if (txDate < minDate) minDate = txDate;
    if (txDate > maxDate) maxDate = txDate;
  }

  // Generate periods from minDate to maxDate
  const periods: InvoicePeriod[] = [];
  
  // Start from the first closing date before minDate
  let currentClosing = minDate.set({ day: cDay, hour: 0, minute: 0, second: 0, millisecond: 0 });
  if (minDate > currentClosing) {
    currentClosing = currentClosing.plus({ months: 1 });
  }

  // To ensure we always have at least "Anterior" and "Atual" even if no transactions
  const fixedClosing = now.set({ day: cDay, hour: 0, minute: 0, second: 0, millisecond: 0 });
  const startTarget = now > fixedClosing ? fixedClosing : fixedClosing.minus({ months: 1 });
  if (currentClosing > startTarget) currentClosing = startTarget;

  // Iterate and create periods
  let safety = 0;
  while (currentClosing <= maxDate.plus({ months: 1 }) || safety < 2) {
    const startDate = currentClosing.minus({ months: 1 });
    const endDate = currentClosing;
    
    // Key should be unique and stable. Using the end date ISO.
    const key = endDate.toISODate() || `period-${safety}`;
    
    periods.push({
      label: formatLabel(endDate),
      key: key,
      startDate: startDate.toJSDate(),
      endDate: endDate.toJSDate(),
      dueDate: makeDue(endDate),
      transactions: [],
      total: 0,
    });
    
    currentClosing = currentClosing.plus({ months: 1 });
    safety++;
    if (safety > 120) break; // 10 years limit
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
    
    if (periodIdx !== -1) {
      periods[periodIdx].transactions.push(tx);
      periods[periodIdx].total += Number(tx.amount);
    }
  }

  // Filter out empty periods except for the current and previous one
  return periods.filter(p => {
    const endDate = DateTime.fromJSDate(p.endDate);
    const isCurrent = now <= endDate && now > endDate.minus({ months: 1 });
    const isPast = now > endDate && now <= endDate.plus({ months: 1 });
    return isCurrent || isPast || p.transactions.length > 0;
  });
}
