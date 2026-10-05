export type TransactionSettlementStatus = "posted" | "pending";

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  let y: number | undefined;
  let m: number | undefined;
  let d: number | undefined;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  } else {
    const br = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (br) {
      y = Number(br[3]); m = Number(br[2]); d = Number(br[1]);
    }
  }

  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

export function isPendingTransaction(status: string | null | undefined): boolean {
  return status === "pending";
}

export function shouldAutoPendScheduledTransaction(
  date: string | null | undefined,
  card: string | null | undefined,
  now = new Date(),
): boolean {
  if (card) return false;
  const scheduled = parseDateOnly(date);
  if (!scheduled) return false;
  return startOfLocalDay(scheduled).getTime() > startOfLocalDay(now).getTime();
}

export function countsTowardCurrentBalance(
  tx: {
    transaction_status?: string | null;
    posted_at?: string | null;
    transaction_date?: string | null;
    date?: string | null;
  },
  now = new Date(),
): boolean {
  if (isPendingTransaction(tx.transaction_status)) return false;

  if (tx.posted_at) {
    const postedAt = new Date(tx.posted_at);
    if (!Number.isNaN(postedAt.getTime())) return postedAt.getTime() <= now.getTime();
  }

  const scheduled = parseDateOnly(tx.transaction_date || tx.date);
  if (!scheduled) return true;
  return startOfLocalDay(scheduled).getTime() <= startOfLocalDay(now).getTime();
}
