import { useEffect, useState } from 'react';
import { api } from '../api';
import PeriodPicker, { defaultPeriod } from './PeriodPicker';
import Plate from './Plate';
import { CATEGORY_LABELS, METHOD_LABELS, fmtMoney, fmtDay, fmtDateTime, downloadCsv } from '../labels';

const ACTIONS = {
  add: { label: 'Добавил', tone: 'paid' },
  edit: { label: 'Изменил', tone: 'wait' },
  delete: { label: 'Удалил', tone: 'unpaid' },
  confirm: { label: 'Подтвердил', tone: 'off' },
};
const FILTERS = [['all', 'Все'], ['add', 'Добавили'], ['edit', 'Изменили'], ['delete', 'Удалили'], ['confirm', 'Подтвердили']];

function signed(e) {
  const sign = e.kind === 'EXPENSE' ? '−' : '+';
  return `${sign}${fmtMoney(e.amount)}`;
}

function what(e) {
  return [CATEGORY_LABELS[e.category] || e.category, METHOD_LABELS[e.method] || e.method].filter(Boolean).join(' · ');
}

function changes(e) {
  if (e.action !== 'edit' || !e.old) return null;
  const out = [];
  if (Number(e.old.amount) !== Number(e.amount)) out.push(`сумма ${fmtMoney(e.old.amount)} → ${fmtMoney(e.amount)}`);
  if (e.old.method && e.old.method !== e.method) out.push(`способ ${METHOD_LABELS[e.old.method] || e.old.method} → ${METHOD_LABELS[e.method] || e.method}`);
  if (e.old.tx_date && String(e.old.tx_date).slice(0, 10) !== e.tx_date) out.push(`дата ${fmtDay(String(e.old.tx_date).slice(0, 10))} → ${fmtDay(e.tx_date)}`);
  if (e.old.category && e.old.category !== e.category) out.push(`статья ${CATEGORY_LABELS[e.old.category] || e.old.category} → ${CATEGORY_LABELS[e.category] || e.category}`);
  return out.length ? out.join(', ') : 'без изменения суммы';
}

export default function TxJournal() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/audit/transactions?from=${period.from}&to=${period.to}`)
      .then(setData)
      .catch((err) => setError(err.message || 'Не удалось загрузить ведомость'));
  }, [period.from, period.to]);

  const events = (data?.events || []).filter((e) => filter === 'all' || e.action === filter);
  const sum = (action) => (data?.events || [])
    .filter((e) => e.action === action && e.kind !== 'EXPENSE')
    .reduce((s, e) => s + e.amount, 0);

  function exportCsv() {
    downloadCsv(`ведомость_${period.from}_${period.to}.csv`,
      ['Когда', 'Кто', 'Действие', 'Машина', 'Водитель', 'За дату', 'Статья / способ', 'Сумма', 'Что изменилось', 'Комментарий'],
      events.map((e) => [
        fmtDateTime(e.at), e.user_name || '', ACTIONS[e.action].label, e.plate || '', e.driver_name || '',
        e.tx_date ? fmtDay(e.tx_date) : '', what(e), e.kind === 'EXPENSE' ? -e.amount : e.amount, changes(e) || '', e.comment || '',
      ]));
  }

  return (
    <div className="ledger-box">
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <div className="notice notice--error">{error}</div>}
      {!data && !error && <div className="muted">Загрузка…</div>}
      {data && (
        <>
          <div className="ledger-box__head">
            <div className="ledger-sum">
              <div className="ledger-sum__item">
                <span className="ledger-sum__label">Добавили доходов</span>
                <b>{fmtMoney(sum('add'))}</b>
              </div>
              <div className="ledger-sum__item">
                <span className="ledger-sum__label">Удалили доходов</span>
                <b>{fmtMoney(sum('delete'))}</b>
              </div>
              <div className="ledger-sum__item">
                <span className="ledger-sum__label">Изменений</span>
                <b>{(data.events || []).filter((e) => e.action === 'edit').length}</b>
              </div>
            </div>
            <button type="button" className="btn btn--quiet" onClick={exportCsv} disabled={!events.length}>Скачать в Excel</button>
          </div>
          <div className="chips" style={{ margin: '4px 0 12px' }}>
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={`chip ${filter === key ? 'chip--on' : ''}`} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          {events.length === 0 ? <div className="empty">За этот период операций нет</div> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__th">Когда</th>
                    <th className="table__th">Кто</th>
                    <th className="table__th">Действие</th>
                    <th className="table__th">Машина / водитель</th>
                    <th className="table__th">За дату</th>
                    <th className="table__th">Статья · способ</th>
                    <th className="table__th table__num">Сумма</th>
                    <th className="table__th">Подробности</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={`${e.action}-${e.tx_id}-${e.at}-${i}`} className="table__row">
                      <td className="table__td">{fmtDateTime(e.at)}</td>
                      <td className="table__td">{e.user_name || <span className="muted">—</span>}</td>
                      <td className="table__td">
                        <span className={`pay-status pay-status--${ACTIONS[e.action].tone}`}>
                          {ACTIONS[e.action].label}
                        </span>
                      </td>
                      <td className="table__td">
                        {e.plate ? <Plate value={e.plate} /> : null}
                        {e.driver_name && <div className="muted small">{e.driver_name}</div>}
                      </td>
                      <td className="table__td">{e.tx_date ? fmtDay(e.tx_date) : '—'}</td>
                      <td className="table__td">{what(e) || '—'}</td>
                      <td className="table__td table__num">
                        <b className={e.action === 'delete' ? 'ledger__debt' : undefined}>{signed(e)}</b>
                      </td>
                      <td className="table__td small">
                        {[changes(e), e.deleted ? 'потом удалено' : null, e.comment].filter(Boolean).join(' · ') || <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
