import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAccruals, closeCalendarDays } from './carMoney.js';

test('выходной из календаря снимает начисление даже при отчёте за день', () => {
  const inputs = {
    ids: [1],
    assignments: [],
    reports: [{ car_id: 1, day: '2026-10-18' }],
    rates: [{ car_id: 1, rate: 400000, valid_from: '2026-01-01', id: 1 }],
    daysOff: [{ car_id: 1, day: '2026-10-18', reason: null }],
  };
  const result = computeAccruals(inputs, { to: '2026-10-31' });
  assert.equal(result.get(1).days.some((d) => d.day === '2026-10-18'), false);
});

test('оплата в выходной с отчётом — offpaid, не закрыто', () => {
  const days = [
    {
      day: '2026-10-18', driver_id: 2, reported: true, day_off: true,
      accrued: 0, paid: 400000, pending: 0,
    },
  ];
  closeCalendarDays(days);
  assert.equal(days[0].status, 'offpaid');
});

test('рабочий день с отчётом и оплатой — закрыто', () => {
  const days = [
    {
      day: '2026-10-16', driver_id: 2, reported: true, day_off: false,
      accrued: 400000, paid: 400000, pending: 0,
    },
  ];
  closeCalendarDays(days);
  assert.equal(days[0].status, 'paid');
});
