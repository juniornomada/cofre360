import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTodayLocal } from '../lib/date-utils';
import { DateTime } from 'luxon';

const TZ = 'America/Sao_Paulo';

describe('isTodayLocal (America/Sao_Paulo)', () => {
  beforeEach(() => {
    // Mock "now" to a stable date: 2024-06-05 12:00:00 in America/Sao_Paulo
    const mockNow = DateTime.fromISO('2024-06-05T12:00:00', { zone: TZ });
    vi.setSystemTime(mockNow.toJSDate());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for current date in TZ', () => {
    const today = DateTime.now().setZone(TZ).toJSDate();
    expect(isTodayLocal(today)).toBe(true);
  });

  it('returns false for yesterday in TZ', () => {
    const yesterday = DateTime.now().setZone(TZ).minus({ days: 1 }).toJSDate();
    expect(isTodayLocal(yesterday)).toBe(false);
  });

  it('returns false for tomorrow in TZ', () => {
    const tomorrow = DateTime.now().setZone(TZ).plus({ days: 1 }).toJSDate();
    expect(isTodayLocal(tomorrow)).toBe(false);
  });

  it('respects the start of the day (00:00:00) in local time', () => {
    const midnight = DateTime.now().setZone(TZ).startOf('day').toJSDate();
    expect(isTodayLocal(midnight)).toBe(true);
  });

  it('respects the end of the day (23:59:59) in local time', () => {
    const lateNight = DateTime.now().setZone(TZ).endOf('day').toJSDate();
    expect(isTodayLocal(lateNight)).toBe(true);
  });

  it('handles UTC dates that fall on a different day than local time', () => {
    // 2024-06-05 01:00 UTC is 2024-06-04 22:00 in Sao Paulo (-3h)
    const utcDate = DateTime.fromISO('2024-06-05T01:00:00', { zone: 'UTC' }).toJSDate();
    // Since our mock "now" is 2024-06-05 12:00 Sao Paulo, 
    // the utcDate (2024-06-04 local) should be false.
    expect(isTodayLocal(utcDate)).toBe(false);
    
    // 2024-06-05 23:00 Sao Paulo is 2024-06-06 02:00 UTC
    const utcNextDay = DateTime.fromISO('2024-06-06T02:00:00', { zone: 'UTC' }).toJSDate();
    // This is 2024-06-05 23:00 in Sao Paulo, so it should be true
    expect(isTodayLocal(utcNextDay)).toBe(true);
  });

  it('handles ISO string dates', () => {
    expect(isTodayLocal('2024-06-05T10:00:00Z')).toBe(true); // 07:00 Sao Paulo
    expect(isTodayLocal('2024-06-04T20:00:00Z')).toBe(false); // 17:00 Sao Paulo (previous day)
  });

  it('handles DD/MM/YYYY string dates', () => {
    expect(isTodayLocal('05/06/2024')).toBe(true);
    expect(isTodayLocal('04/06/2024')).toBe(false);
  });

  it('returns false for invalid date strings', () => {
    expect(isTodayLocal('invalid-date')).toBe(false);
    expect(isTodayLocal(null)).toBe(false);
  });
});
