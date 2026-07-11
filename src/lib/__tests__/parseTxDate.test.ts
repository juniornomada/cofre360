import { describe, it, expect } from 'vitest';
import { parseTxDate, groupByBillingCycle, type CardTransaction } from '../invoice-utils';

/**
 * Regression tests for the fix where index.tsx was overwriting `created_at`
 * with the textual `date` ("18 abr"), causing parseTxDate to fall back to the
 * current year instead of the DB-provided year.
 *
 * Contract:
 *   parseTxDate(textualDate, createdAtIso) → Date whose year comes from
 *   `createdAtIso` when the textual date lacks a year (DD mmm format).
 */
describe('parseTxDate — textual "DD mmm" + created_at year source', () => {
  it('uses the year from created_at fallback when date is "DD mmm"', () => {
    const d = parseTxDate('03 jul', '2025-07-10T18:01:10Z');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(6); // Jul
    expect(d.getDate()).toBe(3);
  });

  it('resolves future installments (out/set/ago) into the same created_at year', () => {
    const createdAt = '2026-07-10T18:01:10Z';
    const jul = parseTxDate('03 jul', createdAt);
    const ago = parseTxDate('03 ago', createdAt);
    const set = parseTxDate('03 set', createdAt);
    const out = parseTxDate('03 out', createdAt);
    for (const d of [jul, ago, set, out]) expect(d.getFullYear()).toBe(2026);
    expect([jul.getMonth(), ago.getMonth(), set.getMonth(), out.getMonth()]).toEqual([6, 7, 8, 9]);
  });

  it('falls back to current year when created_at is a bogus string (e.g. old bug passing "18 abr")', () => {
    const d = parseTxDate('18 abr', '18 abr');
    // Bug reproduction: without a real ISO fallback, year defaults to "now".
    expect(d.getFullYear()).toBe(new Date().getFullYear());
    expect(d.getMonth()).toBe(3); // abr
    expect(d.getDate()).toBe(18);
  });

  it('is case- and whitespace-insensitive for the month token', () => {
    const a = parseTxDate('  05  JUN  ', '2025-01-01T00:00:00Z');
    expect(a.getFullYear()).toBe(2025);
    expect(a.getMonth()).toBe(5);
    expect(a.getDate()).toBe(5);
  });

  it('parses a full ISO date directly and ignores the fallback', () => {
    const d = parseTxDate('2024-12-31', '2020-01-01T00:00:00Z');
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });
});

/**
 * End-to-end invariant that the previous fix guarantees:
 * a transaction whose textual date is "DD mmm" and whose created_at ISO carries
 * the year MUST land in the same billing cycle as an equivalent transaction
 * expressed as a full ISO date on the same day.
 */
describe('parseTxDate + groupByBillingCycle — cycle stability', () => {
  const closingDay = 10;
  const dueDay = 20;

  const mkTx = (id: string, date: string, created_at: string): CardTransaction => ({
    id,
    name: `Tx ${id}`,
    icon: null,
    category: 'x',
    date,
    amount: 100,
    type: 'expense',
    created_at,
    total_installments: null,
    installment_number: null,
    installment_group_id: null,
  });

  it('places "05 jul" + created_at 2025-07-10 in the same cycle as the ISO 2025-07-05', () => {
    const reference = new Date(2025, 6, 15); // 15 Jul 2025
    const textual = groupByBillingCycle([mkTx('a', '05 jul', '2025-07-10T00:00:00Z')], closingDay, dueDay, reference);
    const iso = groupByBillingCycle([mkTx('b', '2025-07-05', '2025-07-05T00:00:00Z')], closingDay, dueDay, reference);

    const findWith = (periods: typeof textual, id: string) =>
      periods.find((p) => p.transactions.some((t) => t.id === id));

    const pa = findWith(textual, 'a');
    const pb = findWith(iso, 'b');
    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(pa!.key).toBe(pb!.key);
    expect(pa!.startDate.getFullYear()).toBe(pb!.startDate.getFullYear());
    expect(pa!.startDate.getMonth()).toBe(pb!.startDate.getMonth());
    expect(pa!.endDate.getFullYear()).toBe(pb!.endDate.getFullYear());
    expect(pa!.endDate.getMonth()).toBe(pb!.endDate.getMonth());
  });

  it('year-end: "28 dez" + created_at 2026-12-28 stays in the Dec/2026 cycle even when evaluated on 02 Jan 2027', () => {
    const reference = new Date(2027, 0, 2); // 02 Jan 2027
    const textual = groupByBillingCycle([mkTx('a', '28 dez', '2026-12-28T00:00:00Z')], closingDay, dueDay, reference);
    const iso = groupByBillingCycle([mkTx('b', '2026-12-28', '2026-12-28T00:00:00Z')], closingDay, dueDay, reference);

    const pa = textual.find((p) => p.transactions.some((t) => t.id === 'a'))!;
    const pb = iso.find((p) => p.transactions.some((t) => t.id === 'b'))!;
    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(pa.key).toBe(pb.key);
    expect(pa.dueDate.getFullYear()).toBe(pb.dueDate.getFullYear());
    expect(pa.dueDate.getMonth()).toBe(pb.dueDate.getMonth());
  });

  it('regression: overwriting created_at with the textual date (old bug) drifts the cycle at year-end', () => {
    // Simulates the pre-fix state: created_at was replaced by the "DD mmm" string,
    // so parseTxDate fell back to `new Date().getFullYear()` instead of 2026.
    const reference = new Date(2027, 0, 2);
    const buggy = parseTxDate('28 dez', '28 dez');
    const fixed = parseTxDate('28 dez', '2026-12-28T00:00:00Z');
    expect(buggy.getFullYear()).toBe(new Date().getFullYear());
    expect(fixed.getFullYear()).toBe(2026);
    // And on the aggregate side they land in different cycles when the current
    // year != 2026: the fixed one belongs to Dec/2026, the buggy one to Dec/<now>.
    if (new Date().getFullYear() !== 2026) {
      const buggyGroup = groupByBillingCycle(
        [mkTx('a', '28 dez', '28 dez')],
        closingDay,
        dueDay,
        reference,
      );
      const fixedGroup = groupByBillingCycle(
        [mkTx('a', '28 dez', '2026-12-28T00:00:00Z')],
        closingDay,
        dueDay,
        reference,
      );
      const kBuggy = buggyGroup.find((p) => p.transactions.length > 0)?.key;
      const kFixed = fixedGroup.find((p) => p.transactions.length > 0)?.key;
      expect(kBuggy).not.toBe(kFixed);
    }
  });
});
