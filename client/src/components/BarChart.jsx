import { fmtMoney, fmtDay, shortDay } from '../labels';

// Столбчатый график по дням без сторонних библиотек.
// series: [{ key, label, className }], data: [{ day, [key]: number }]
export default function BarChart({ data, series, height = 180 }) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const step = data.length > 20 ? Math.ceil(data.length / 10) : 1;
  const empty = data.every((d) => series.every((s) => !Number(d[s.key])));

  return (
    <div className="chart">
      {series.length > 1 && (
        <div className="chart__legend">
          {series.map((s) => (
            <span key={s.key} className="chart__legend-item">
              <span className={`chart__swatch ${s.className}`} />{s.label}
            </span>
          ))}
        </div>
      )}
      <div className="chart__plot" style={{ height }}>
        {empty && <div className="chart__empty">За этот период подтверждённых сумм нет</div>}
        {data.map((d, i) => (
          <div key={d.day} className="chart__col">
            <div className="chart__bars">
              {series.map((s) => {
                const v = Number(d[s.key]) || 0;
                return (
                  <div
                    key={s.key}
                    className={`chart__bar ${s.className}`}
                    style={{ height: `${(v / max) * 100}%` }}
                    title={`${fmtDay(d.day)} · ${s.label}: ${fmtMoney(v)} сум`}
                  />
                );
              })}
            </div>
            <div className="chart__label">{i % step === 0 ? shortDay(d.day) : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
