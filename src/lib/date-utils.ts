import { DateTime } from 'luxon';

/**
 * Checks if a given date string (ISO or common formats) corresponds to "today" 
 * in the user's local timezone (defaults to America/Sao_Paulo).
 */
export const isTodayLocal = (dateStr: string | Date | null, userZone: string = 'America/Sao_Paulo'): boolean => {
  if (!dateStr) return false;
  
  let target: DateTime;
  
  if (dateStr instanceof Date) {
    target = DateTime.fromJSDate(dateStr).setZone(userZone);
  } else {
    // Try ISO first
    target = DateTime.fromISO(dateStr, { zone: userZone });
    
    // If not ISO, it might be a custom format (like DD/MM/YYYY from index.tsx)
    if (!target.isValid) {
      // Basic DD/MM/YYYY parser if needed, but usually we handle ISO from DB
      const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slashMatch) {
        const day = parseInt(slashMatch[1], 10);
        const month = parseInt(slashMatch[2], 10);
        let year = parseInt(slashMatch[3], 10);
        if (year < 100) year += 2000;
        target = DateTime.fromObject({ year, month, day }, { zone: userZone });
      }
    }
  }

  if (!target.isValid) return false;

  const now = DateTime.now().setZone(userZone);
  return target.hasSame(now, 'day');
};
