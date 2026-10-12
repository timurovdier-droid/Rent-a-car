import { Router } from 'express';
import { pool } from '../db.js';
import { sendPush, pushPublicKey } from '../push.js';
import { driverDebt } from './me.js';

const router = Router();

const EVERY_MS = 100 * 60 * 1000;
const QUIET_FROM = 23;
const QUIET_TO = 8;

function tashkentHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hourCycle: 'h23' }).format(date));
}

// Вызывается по расписанию раз в 2 часа. Без ключа: каждому устройству шлём не чаще раза в 100 минут.
async function remindDebts(req, res) {
  try {
    if (!pushPublicKey()) return res.json({ sent: 0, reason: 'push not configured' });
    const hour = tashkentHour();
    if (hour >= QUIET_FROM || hour < QUIET_TO) return res.json({ sent: 0, reason: 'quiet hours' });

    const { rows: subs } = await pool.query(
      'SELECT id, driver_id, endpoint, p256dh, auth, last_debt_push_at FROM push_subscriptions WHERE driver_id IS NOT NULL'
    );
    const now = Date.now();
    const debts = new Map();
    let sent = 0;
    for (const sub of subs) {
      const last = sub.last_debt_push_at ? Date.parse(sub.last_debt_push_at) : 0;
      if (now - last < EVERY_MS) continue;
      const driverId = Number(sub.driver_id);
      if (!debts.has(driverId)) debts.set(driverId, await driverDebt(driverId));
      const debt = debts.get(driverId);
      if (debt.total <= 0) continue;
      const result = await sendPush(sub, {
        title: `Долг: ${debt.total.toLocaleString('ru-RU')} сум`,
        body: debt.charges > 0 && debt.rent > 0
          ? `Аренда ${debt.rent.toLocaleString('ru-RU')} сум и начисления ${debt.charges.toLocaleString('ru-RU')} сум. Пожалуйста, оплатите.`
          : 'Пожалуйста, оплатите аренду и сообщите об оплате в кабинете.',
        url: '/payments',
        tag: 'debt',
      });
      if (result === 'gone') {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      } else if (result === 'sent') {
        sent += 1;
        await pool.query('UPDATE push_subscriptions SET last_debt_push_at = $1 WHERE id = $2', [new Date(now).toISOString(), sub.id]);
      }
    }
    res.json({ sent, checked: subs.length });
  } catch (err) {
    console.error('Ошибка рассылки напоминаний о долге:', err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  }
}

router.get('/debt', remindDebts);
router.post('/debt', remindDebts);

export default router;
