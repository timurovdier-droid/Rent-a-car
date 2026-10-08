import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtMoney, fmtDay, todayLocal } from '../labels';
import MonthRangePicker, { wholeMonth, rangeLabel } from './MonthRangePicker';

const monthLong = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' });

function shortMoney(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млрд`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString('ru-RU')} тыс`;
  return String(Math.round(v));
}

function plural(n, one, few, many) {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

function signed(v) {
  if (!v) return '0';
  return `${v > 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}`;
}

function Delta({ now, before, inverse = false }) {
  if (!before && !now) return null;
  if (!before) return <span className="mf-delta mf-delta--muted">новое</span>;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  const good = inverse ? pct <= 0 : pct >= 0;
  return (
    <span className={`mf-delta ${good ? 'mf-delta--up' : 'mf-delta--down'}`}>
      {pct > 0 ? '+' : ''}{pct} %{pct >= 0 ? '↑' : '↓'}
    </span>
  );
}

function Kpi({ title, value, prev, inverse }) {
  return (
    <div className="mf-card mf-kpi">
      <div className="mf-kpi__title">{title}</div>
      <div className="mf-kpi__value">
        <span>{signed(inverse ? -value : value)} сум</span>
        <Delta now={value} before={prev} inverse={inverse} />
      </div>
    </div>
  );
}

function SplitChart({ data, today, from, to }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return (
    <div className="mf-chart">
      <div className="mf-chart__grid mf-chart__grid--top"><span>{shortMoney(max)}</span></div>
      <div className="mf-chart__grid mf-chart__grid--zero"><span>0</span></div>
      <div className="mf-chart__grid mf-chart__grid--bottom"><span>−{shortMoney(max)}</span></div>
      <div className="mf-chart__cols">
        {data.map((d) => {
          const n = Number(d.day.slice(8, 10));
          const dim = d.day > today || d.day < from || d.day > to;
          return (
            <div
              key={d.day}
              className={`mf-chart__col ${dim ? 'mf-chart__col--future' : ''}`}
              title={`${fmtDay(d.day)}\nДоход: ${fmtMoney(d.income)} сум\nРасход: ${fmtMoney(d.expense)} сум\nИтог: ${signed(d.income - d.expense)} сум`}
            >
              <div className="mf-chart__half mf-chart__half--up">
                <div className="mf-bar mf-bar--in" style={{ height: `${(d.income / max) * 100}%` }} />
              </div>
              <div className="mf-chart__half">
                <div className="mf-bar mf-bar--out" style={{ height: `${(d.expense / max) * 100}%` }} />
              </div>
              <div className="mf-chart__label">{n % 2 === 1 ? n : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MonthFinance({ title = 'Финансовые показатели', subtitle = 'Следите за показателями и оценивайте прибыль' }) {
  const [range, setRange] = useState(() => wholeMonth(todayLocal().slice(0, 7)));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    api.get(`/finance/month?month=${range.month}&from=${range.from}&to=${range.to}`)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError('Не удалось загрузить показатели'); });
    return () => { alive = false; };
  }, [range]);

  const stats = useMemo(() => {
    if (!data) return null;
    const passed = data.chart.filter((d) => d.day <= data.today && d.day >= data.from && d.day <= data.to);
    const best = passed.reduce((b, d) => (d.income > (b?.income || 0) ? d : b), null);
    const avg = passed.length ? data.totals.profit / passed.length : 0;
    return { best, avg, days: passed.length };
  }, [data]);

  const compareHint = data?.partial
    ? `к ${fmtDay(data.compare_to.from).slice(0, 5)}–${fmtDay(data.compare_to.to).slice(0, 5)} прошлого месяца`
    : 'к прошлому месяцу';
  const wholeRange = data && data.from.endsWith('-01') && (data.to === data.today || data.to === data.chart[data.chart.length - 1].day);
  const periodWord = !data ? 'месяц'
    : wholeRange ? monthLong.format(new Date(`${data.month}-01T00:00:00Z`))
      : rangeLabel({ month: data.month, from: data.from, to: data.to });

  return (
    <div className="mf">
      <MonthRangePicker value={range} onChange={setRange} />

      {error && <div className="notice notice--error">{error}</div>}

      <section className="mf-block">
        <h2 className="mf-title">{title}</h2>
        <p className="mf-muted mf-sub">{subtitle} · сравнение {compareHint}</p>
        <div className="mf-kpis">
          <Kpi title="Выручка" value={data?.totals.income || 0} prev={data?.prev.income || 0} />
          <Kpi title="Расходы" value={data?.totals.expenses || 0} prev={data?.prev.expenses || 0} inverse />
          <Kpi title="Чистый доход" value={data?.totals.profit || 0} prev={data?.prev.profit || 0} />
        </div>
      </section>

      <section className="mf-block">
        <div className="mf-split">
          <div className="mf-split__side">
            <h2 className="mf-title">Чистый доход за {periodWord}</h2>
            <p className="mf-muted mf-small">Доходы минус расходы по подтверждённым записям. Зелёное — доход за день, красное — расход.</p>
            <div className="mf-big">{data ? `${fmtMoney(data.totals.profit)} сум` : '…'}</div>
          </div>
          {data && <SplitChart data={data.chart} today={data.today} from={data.from} to={data.to} />}
        </div>

        {data && (
          <>
            <div className="mf-divider" />
            <h3 className="mf-subtitle">{data.debt !== undefined ? 'Что требует внимания' : 'Коротко о месяце'}</h3>
            <div className="mf-notes">
              {data.debt !== undefined ? (
                <>
                  <div className="mf-card mf-note">
                    <div className="mf-note__title">Водители должны</div>
                    <div className="mf-muted mf-small">
                      {data.debtors ? `Долг есть у ${data.debtors} ${plural(data.debtors, 'машины', 'машин', 'машин')}: начислено по ставке больше, чем получено` : 'Все водители рассчитались'}
                    </div>
                    <div className="mf-note__value">
                      {fmtMoney(data.debt)} сум {data.debt > 0 && <span className="mf-alert">!</span>}
                    </div>
                  </div>
                  <div className="mf-card mf-note">
                    <div className="mf-note__title">Ждёт подтверждения</div>
                    <div className="mf-muted mf-small">
                      {data.pending_count ? `${data.pending_count} ${plural(data.pending_count, 'запись', 'записи', 'записей')} от диспетчеров ещё не попали в итоги` : 'Все записи подтверждены'}
                    </div>
                    <div className="mf-note__value">{fmtMoney(data.pending)} сум</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mf-card mf-note">
                    <div className="mf-note__title">В среднем в день</div>
                    <div className="mf-muted mf-small">Чистый доход за {stats.days} дн.</div>
                    <div className="mf-note__value">{fmtMoney(Math.round(stats.avg))} сум</div>
                  </div>
                  <div className="mf-card mf-note">
                    <div className="mf-note__title">Лучший день</div>
                    <div className="mf-muted mf-small">{stats.best ? fmtDay(stats.best.day) : 'Доходов пока не было'}</div>
                    <div className="mf-note__value">{fmtMoney(stats.best?.income || 0)} сум</div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
