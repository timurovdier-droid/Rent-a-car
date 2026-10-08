import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Plate from '../components/Plate';
import PeriodPicker, { defaultPeriod } from '../components/PeriodPicker';
import { fmtMoney, fmtDay, downloadCsv } from '../labels';

const TABS = [
  ['cars', 'По машинам'],
  ['owners', 'По арендодателям'],
  ['debts', 'Долги'],
  ['days', 'По дням'],
];

function Num({ value, tone }) {
  const color = tone === 'debt' && value ? 'var(--c-danger)' : tone === 'profit' && value < 0 ? 'var(--c-danger)' : undefined;
  return <td className="table__td table__num" style={{ color, fontWeight: tone ? 600 : undefined }}>{fmtMoney(value)}</td>;
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('cars');
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/finance/overview?from=${period.from}&to=${period.to}`)
      .then(setData)
      .catch(() => setError('Не удалось загрузить отчёт'));
  }, [period]);

  const suffix = `${period.from}_${period.to}`;
  const debts = (data?.cars || []).filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
  const sum = (list, key) => list.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  function exportCurrent() {
    if (!data) return;
    if (tab === 'cars') {
      downloadCsv(`машины_${suffix}.csv`,
        ['Госномер', 'Машина', 'Арендодатель', 'Водитель', 'Начислено', 'Доход', 'Расходы', 'Прибыль', 'Долг сейчас'],
        data.cars.map((c) => [c.plate, `${c.brand} ${c.model}`, c.owner_name || '', c.driver_name || '', c.accrued, c.income, c.expenses, c.profit, c.debt]));
    } else if (tab === 'owners') {
      downloadCsv(`арендодатели_${suffix}.csv`,
        ['Арендодатель', 'Машин', 'Доход', 'Расходы', 'Прибыль'],
        data.owners.map((o) => [o.owner_name, o.cars, o.income, o.expenses, o.profit]));
    } else if (tab === 'debts') {
      downloadCsv(`долги_${todayName()}.csv`,
        ['Госномер', 'Машина', 'Водитель', 'Начислено всего', 'Получено всего', 'Долг'],
        debts.map((c) => [c.plate, `${c.brand} ${c.model}`, c.driver_name || '', c.accrued_all, c.received_all, c.debt]));
    } else {
      downloadCsv(`по_дням_${suffix}.csv`,
        ['Дата', 'Доход', 'Расход', 'Итог'],
        data.chart.map((d) => [fmtDay(d.day), d.income, d.expense, d.income - d.expense]));
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Отчёты</h1>
          <p className="page-sub">Доход, расходы, прибыль и долги по каждой машине</p>
        </div>
        <button className="btn btn--quiet" onClick={exportCurrent} disabled={!data}>Скачать в Excel</button>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} />

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'tab--on' : ''}`} onClick={() => setTab(key)}>
            {label}{key === 'debts' && debts.length ? ` · ${debts.length}` : ''}
          </button>
        ))}
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {!data && !error && <div className="muted">Загрузка…</div>}

      {data && tab === 'cars' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Машина</th>
                <th className="table__th">Водитель</th>
                <th className="table__th table__num">Начислено</th>
                <th className="table__th table__num">Доход</th>
                <th className="table__th table__num">Расходы</th>
                <th className="table__th table__num">Прибыль</th>
                <th className="table__th table__num">Долг сейчас</th>
              </tr>
            </thead>
            <tbody>
              {data.cars.map((c) => (
                <tr key={c.car_id} className="table__row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cars/${c.car_id}`)}>
                  <td className="table__td"><Plate value={c.plate} /> <span className="muted small">{c.brand} {c.model}</span></td>
                  <td className="table__td">{c.driver_name || <span className="muted">—</span>}</td>
                  <Num value={c.accrued} />
                  <Num value={c.income} />
                  <Num value={c.expenses} />
                  <Num value={c.profit} tone="profit" />
                  <Num value={c.debt} tone="debt" />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="table__td" colSpan={2}><b>Итого</b></td>
                <Num value={sum(data.cars, 'accrued')} tone="sum" />
                <Num value={sum(data.cars, 'income')} tone="sum" />
                <Num value={sum(data.cars, 'expenses')} tone="sum" />
                <Num value={sum(data.cars, 'profit')} tone="profit" />
                <Num value={sum(data.cars, 'debt')} tone="debt" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && tab === 'owners' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Арендодатель</th>
                <th className="table__th table__num">Машин</th>
                <th className="table__th table__num">Доход</th>
                <th className="table__th table__num">Расходы</th>
                <th className="table__th table__num">Прибыль</th>
              </tr>
            </thead>
            <tbody>
              {data.owners.map((o) => (
                <tr key={o.owner_id || 0} className="table__row">
                  <td className="table__td">{o.owner_name}</td>
                  <td className="table__td table__num">{o.cars}</td>
                  <Num value={o.income} />
                  <Num value={o.expenses} />
                  <Num value={o.profit} tone="profit" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'debts' && (
        debts.length === 0 ? <div className="empty">Долгов нет — все водители рассчитались</div> : (
          <div className="table-wrap">
            <p className="muted small" style={{ marginTop: 0 }}>Долг считается за всё время: начислено по ставке минус подтверждённые поступления.</p>
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Машина</th>
                  <th className="table__th">Водитель сейчас</th>
                  <th className="table__th table__num">Начислено</th>
                  <th className="table__th table__num">Получено</th>
                  <th className="table__th table__num">Долг</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((c) => (
                  <tr key={c.car_id} className="table__row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cars/${c.car_id}`)}>
                    <td className="table__td"><Plate value={c.plate} /> <span className="muted small">{c.brand} {c.model}</span></td>
                    <td className="table__td">{c.driver_name || <span className="muted">—</span>}</td>
                    <Num value={c.accrued_all} />
                    <Num value={c.received_all} />
                    <Num value={c.debt} tone="debt" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {data && tab === 'days' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Дата</th>
                <th className="table__th table__num">Доход</th>
                <th className="table__th table__num">Расход</th>
                <th className="table__th table__num">Итог</th>
              </tr>
            </thead>
            <tbody>
              {[...data.chart].reverse().map((d) => (
                <tr key={d.day} className="table__row">
                  <td className="table__td">{fmtDay(d.day)}</td>
                  <Num value={d.income} />
                  <Num value={d.expense} />
                  <Num value={d.income - d.expense} tone="profit" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function todayName() {
  return new Date().toISOString().slice(0, 10);
}
