/**
 * Advances a purchase date by a number of calendar months without overflowing
 * into the following month when the original day does not exist in the target.
 *
 * Always anchor on the ORIGINAL purchase date, not on the prior installment:
 * Jan 31 -> Feb 28 -> Mar 31, rather than Jan 31 -> Feb 28 -> Mar 28.
 * Returns a new Date; never mutates the purchase date.
 */
export function addCalendarMonthsClamped(purchaseDate: Date, monthsAhead: number): Date {
  const year = purchaseDate.getFullYear();
  const month = purchaseDate.getMonth() + monthsAhead;
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();

  return new Date(
    year,
    month,
    Math.min(purchaseDate.getDate(), lastDayOfTargetMonth),
    purchaseDate.getHours(),
    purchaseDate.getMinutes(),
    purchaseDate.getSeconds(),
    purchaseDate.getMilliseconds(),
  );
}
