import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAccruals, closeCalendarDays } from './carMoney.js';

test('отчёт за день важнее выходного: начисление не снимается', () => {
  const inputs = {
    ids: [1],
    assignments: [],
    reports: [{ car_id: 1, day: '2026-11-05' }],
    rates: [{ car_id: 1, rate: 450000, valid_from: '2026-01-01', id: 1 }],
    daysOff: [{ car_id: 1, day: '2026-11-05', reason: null }],
  };
  const result = computeAccruals(inputs, { to: '2026-11-10' });
  const detail = result.get(1).days.find((d) => d.day === '2026-11-05');
  assert.equal(detail?.rate, 450000);
});

test('подтверждённая аренда за день отменяет выходной для начисления', () => {
  const inputs = {
    ids: [1],
    assignments: [],
    reports: [],
    rentPaidDays: [{ car_id: 1, day: '2026-11-05' }],
    rates: [{ car_id: 1, rate: 450000, valid_from: '2026-01-01', id: 1 }],
    daysOff: [{ car_id: 1, day: '2026-11-05', reason: null }],
  };
  const result = computeAccruals(inputs, { to: '2026-11-10' });
  const detail = result.get(1).days.find((d) => d.day === '2026-11-05');
  assert.equal(detail?.rate, 450000);
});

test('рабочий день с отчётом и оплатой — закрыто, а не выходной', () => {
  const days = [
    {
      day: '2026-11-05', driver_id: 2, reported: true, day_off: false,
      accrued: 450000, paid: 450000, pending: 0,
    },
  ];
  closeCalendarDays(days);
  assert.equal(days[0].status, 'paid');
});
