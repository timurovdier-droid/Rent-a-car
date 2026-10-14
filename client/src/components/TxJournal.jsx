import { useEffect, useMemo, useState } from 'react';
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
const ACTION_FILTERS = [['all', 'Все'], ['add', 'Добавили'], ['edit', 'Изменили'], ['delete', 'Удалили'], ['confirm', 'Подтвердили']];
const KIND_FILTERS = [['all', 'Все'], ['INCOME', 'Доходы'], ['EXPENSE', 'Расходы']];

function matchEvents(events, { action, kind, txId, carId, userName }) {
  const tx = txId.trim();
  return events.filter((e) => {
    if (action !== 'all' && e.action !== action) return false;
    if (kind !== 'all' && e.kind !== kind) return false;
    if (tx && String(e.tx_id ?? '') !== tx && !String(e.tx_id ?? '').includes(tx)) return false;
    if (carId !== 'all' && String(e.car_id) !== carId) return false;
    if (userName !== 'all' && (e.user_name || '') !== userName) return false;
    return true;
  });
}

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

export default function TxJournal({ driverId = null, title = 'Ведомость операций' }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [actionFilter, setActionFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [txId, setTxId] = useState('');
  const [carFilter, setCarFilter] = useState('all');
  const [whoFilter, setWhoFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const scoped = driverId != null;

  const filters = { action: actionFilter, kind: kindFilter, txId, carId: carFilter, userName: whoFilter };

  useEffect(() => {
    setData(null);
    setError('');
    const q = new URLSearchParams({ from: period.from, to: period.to });
    if (driverId != null) q.set('driver_id', String(driverId));
    api.get(`/audit/transactions?${q}`)
      .then(setData)
      .catch((err) => setError(err.message || 'Не удалось загрузить ведомость'));
  }, [period.from, period.to, driverId]);

  const allEvents = data?.events || [];
  const events = useMemo(() => matchEvents(allEvents, filters), [allEvents, actionFilter, kindFilter, txId, carFilter, whoFilter]);

  const cars = useMemo(() => {
    const m = new Map();
    for (const e of allEvents) if (e.car_id && e.plate) m.set(String(e.car_id), e.plate);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [allEvents]);

  const authors = useMemo(() => {
    const s = new Set(allEvents.map((e) => e.user_name).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [allEvents]);

  const sum = (action) => matchEvents(allEvents, { ...filters, action })
    .filter((e) => e.kind !== 'EXPENSE')
    .reduce((s, e) => s + e.amount, 0);

  const filtersActive = kindFilter !== 'all' || txId.trim() || carFilter !== 'all' || whoFilter !== 'all';

  function resetTxFilters() {
    setKindFilter('all');
    setTxId('');
    setCarFilter('all');
    setWhoFilter('all');
  }

  function exportCsv() {
    downloadCsv(`ведомость_${period.from}_${period.to}.csv`,
      ['Когда', 'Кто', 'Действие', '№ записи', 'Машина', 'Водитель', 'За дату', 'Статья / способ', 'Сумма', 'Что изменилось', 'Комментарий'],
      events.map((e) => [
        fmtDateTime(e.at), e.user_name || '', ACTIONS[e.action].label, e.tx_id || '', e.plate || '', e.driver_name || '',
        e.tx_date ? fmtDay(e.tx_date) : '', what(e), e.kind === 'EXPENSE' ? -e.amount : e.amount, changes(e) || '', e.comment || '',
      ]));
  }

  return (
    <div className="ledger-box">
      {title && <h3 className="panel__title" style={{ marginTop: 0 }}>{title}</h3>}
      <p className="muted small" style={{ marginTop: scoped ? 0 : undefined }}>
        Кто и когда добавил, изменил, удалил или подтвердил деньги по машинам. Время — по Ташкенту.
      </p>
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
                <b>{matchEvents(allEvents, { ...filters, action: 'edit' }).length}</b>
              </div>
            </div>
            <button type="button" className="btn btn--quiet" onClick={exportCsv} disabled={!events.length}>Скачать в Excel</button>
          </div>
          <div className="muted small" style={{ margin: '8px 0 4px' }}>По действию</div>
          <div className="chips" style={{ margin: '0 0 10px' }}>
            {ACTION_FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={`chip ${actionFilter === key ? 'chip--on' : ''}`} onClick={() => setActionFilter(key)}>{label}</button>
            ))}
          </div>
          <div className="muted small" style={{ margin: '0 0 4px' }}>По транзакции</div>
          <div className="chips" style={{ margin: '0 0 10px' }}>
            {KIND_FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={`chip ${kindFilter === key ? 'chip--on' : ''}`} onClick={() => setKindFilter(key)}>{label}</button>
            ))}
          </div>
          <div className="form-grid" style={{ marginBottom: 12, alignItems: 'end' }}>
            <div className="field">
              <label className="field__label" htmlFor="vj-txid">№ записи</label>
              <input
                id="vj-txid"
                className="field__input"
                inputMode="numeric"
                value={txId}
                onChange={(e) => setTxId(e.target.value.replace(/\D/g, ''))}
                placeholder="все"
              />
            </div>
            {!scoped && cars.length > 0 && (
              <div className="field">
                <label className="field__label" htmlFor="vj-car">Машина</label>
                <select id="vj-car" className="field__input" value={carFilter} onChange={(e) => setCarFilter(e.target.value)}>
                  <option value="all">Все машины</option>
                  {cars.map(([id, plate]) => <option key={id} value={id}>{plate}</option>)}
                </select>
              </div>
            )}
            {authors.length > 0 && (
              <div className="field">
                <label className="field__label" htmlFor="vj-who">Кто сделал</label>
                <select id="vj-who" className="field__input" value={whoFilter} onChange={(e) => setWhoFilter(e.target.value)}>
                  <option value="all">Все</option>
                  {authors.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}
            {filtersActive && (
              <div className="field">
                <button type="button" className="btn btn--quiet" onClick={resetTxFilters}>Сбросить фильтры</button>
              </div>
            )}
          </div>
          {events.length === 0 ? (
            <div className="empty">{allEvents.length ? 'Нет строк по выбранным фильтрам' : 'За этот период операций нет'}</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="table__th">Когда</th>
                    <th className="table__th">Кто</th>
                    <th className="table__th">Действие</th>
                    <th className="table__th">№</th>
                    <th className="table__th">{scoped ? 'Машина' : 'Машина / водитель'}</th>
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
                      <td className="table__td muted">{e.tx_id || '—'}</td>
                      <td className="table__td">
                        {e.plate ? <Plate value={e.plate} /> : null}
                        {!scoped && e.driver_name && <div className="muted small">{e.driver_name}</div>}
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
