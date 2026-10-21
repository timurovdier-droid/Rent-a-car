import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeCalendarDays, ledgerTotals, driverCalendarFromRows } from './carMoney.js';

function day(partial) {
  return { day_off: false, pending: 0, paid: 0, accrued: 0, ...partial };
}

test('переплата одного водителя не гасит долг другого: 3 дня × 300 000 = 900 000', () => {
  const days = [
    day({ day: '2026-10-13', driver_id: 1, driver_name: 'ABDULKADIROV', accrued: 300000, paid: 620000 }),
    day({ day: '2026-10-19', driver_id: 2, driver_name: 'Najmiddinov', accrued: 300000, paid: 0 }),
    day({ day: '2026-10-20', driver_id: 2, driver_name: 'Najmiddinov', accrued: 300000, paid: 0 }),
    day({ day: '2026-10-21', driver_id: 2, driver_name: 'Najmiddinov', accrued: 300000, paid: 0 }),
  ];
  const closed = closeCalendarDays(days);
  assert.equal(closed.totals.debt, 900000);
  assert.equal(closed.debtDays, 3);
  assert.equal(closed.debtFrom, '2026-10-19');
  assert.equal(closed.paidThrough, '2026-10-13');
  assert.equal(days[1].status, 'unpaid');
  assert.equal(days[1].left, 300000);
});

test('деньги в выходной одного водителя не уменьшают долг следующего', () => {
  const days = [
    day({ day: '2026-10-11', driver_id: 1, accrued: 0, paid: 320000, day_off: true }),
    day({ day: '2026-10-19', driver_id: 2, accrued: 300000, paid: 0 }),
    day({ day: '2026-10-20', driver_id: 2, accrued: 300000, paid: 0 }),
    day({ day: '2026-10-21', driver_id: 2, accrued: 300000, paid: 0 }),
  ];
  const closed = closeCalendarDays(days);
  assert.equal(closed.totals.debt, 900000);
});

test('переплата того же водителя по-прежнему закрывает его собственные дни', () => {
  const days = [
    day({ day: '2026-10-19', driver_id: 2, accrued: 300000, paid: 600000 }),
    day({ day: '2026-10-20', driver_id: 2, accrued: 300000, paid: 0 }),
  ];
  const closed = closeCalendarDays(days);
  assert.equal(closed.totals.debt, 0);
  assert.equal(days[1].status, 'covered');
  assert.equal(days[1].left, 0);
});

test('без driver_id дни считаются одним водителем — как в календаре водителя', () => {
  const days = [
    day({ day: '2026-10-19', accrued: 300000, paid: 600000 }),
    day({ day: '2026-10-20', accrued: 300000, paid: 0 }),
  ];
  const closed = closeCalendarDays(days);
  assert.equal(closed.totals.debt, 0);
  assert.equal(days[1].status, 'covered');
});

test('календарь водителя не подмешивает закрытые дни другой машины', () => {
  const rows = [
    day({ day: '2026-10-15', car_id: 9, plate: '01754BOA', accrued: 480000, paid: 480000 }),
    day({ day: '2026-10-16', car_id: 9, plate: '01754BOA', accrued: 480000, paid: 480000 }),
    day({ day: '2026-10-19', car_id: 10, plate: '01941BOA', accrued: 300000, paid: 0 }),
    day({ day: '2026-10-20', car_id: 10, plate: '01941BOA', accrued: 300000, paid: 0 }),
    day({ day: '2026-10-21', car_id: 10, plate: '01941BOA', accrued: 300000, paid: 0 }),
  ];
  const { days, closed } = driverCalendarFromRows(rows, { carId: 10 });
  assert.equal(closed.totals.debt, 900000);
  assert.equal(closed.debtDays, 3);
  assert.equal(closed.debtFrom, '2026-10-19');
  assert.equal(closed.paidThrough, null);
  assert.deepEqual(days.map((d) => d.day), ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.ok(days.every((d) => d.accrued === 300000));
});

test('ledgerTotals: долг машины — сумма долгов водителей, а не общий нетто', () => {
  const rows = [
    { driver_id: 1, accrued: 300000, paid: 620000, cash: 620000, transfer: 0, pending: 0, debt: 0 },
    { driver_id: 2, accrued: 300000, paid: 0, cash: 0, transfer: 0, pending: 0, debt: 300000 },
    { driver_id: 2, accrued: 300000, paid: 0, cash: 0, transfer: 0, pending: 0, debt: 300000 },
    { driver_id: 2, accrued: 300000, paid: 0, cash: 0, transfer: 0, pending: 0, debt: 300000 },
  ];
  const totals = ledgerTotals(rows);
  assert.equal(totals.debt, 900000);
  assert.equal(totals.overpaid, 320000);
  assert.equal(totals.debt_days, 3);
});
