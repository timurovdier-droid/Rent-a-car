import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import StatusMark from '../components/StatusMark';
import CarForm from '../components/CarForm';
import CarTile from '../components/CarTile';
import { fmtMoney, fmtNumber } from '../labels';

const VIEW_KEY = 'rac-cars-view';

export default function CarsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'cards');
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || user?.role === 'DISPATCHER';
  const isOwner = user?.role === 'OWNER';

  const fetchCars = useCallback(async () => {
    try {
      setCars(await api.get('/cars'));
    } catch {
      setError('Не удалось загрузить автомобили');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCars(); }, [fetchCars]);

  function switchView(v) {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    return cars.filter((c) => {
      if (status !== 'ALL' && c.status !== status) return false;
      if (!q) return true;
      return [c.plate, c.brand, c.model, c.driver_name, c.owner_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().replace(/\s+/g, '').includes(q));
    });
  }, [cars, query, status]);

  const counts = useMemo(() => ({
    ALL: cars.length,
    RENTED: cars.filter((c) => c.status === 'RENTED').length,
    FREE: cars.filter((c) => c.status === 'FREE').length,
  }), [cars]);

  if (loading) return <div className="muted">Загрузка…</div>;
  if (error) return <div className="notice notice--error">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{isOwner ? 'Мои автомобили' : 'Автомобили'}</h1>
          <p className="page-sub">Откройте машину, чтобы записать доход или расход, выдать водителю или отметить ТО</p>
        </div>
        {isAdmin && <button className="btn" onClick={() => setCreating(true)}>+ Добавить автомобиль</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input
          className="field__input"
          style={{ flex: '1 1 16rem', maxWidth: '24rem' }}
          placeholder="Поиск: номер, марка, водитель"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {[['ALL', 'Все'], ['RENTED', 'В аренде'], ['FREE', 'Свободные']].map(([v, l]) => (
            <button key={v} type="button" className={`chip ${status === v ? 'chip--on' : ''}`} onClick={() => setStatus(v)}>
              {l} · {counts[v]}
            </button>
          ))}
        </div>
        <div className="chips" style={{ marginLeft: 'auto' }}>
          {[['cards', 'Карточки'], ['table', 'Таблица']].map(([v, l]) => (
            <button key={v} type="button" className={`chip ${view === v ? 'chip--on' : ''}`} onClick={() => switchView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">{cars.length === 0 ? (isAdmin ? 'Автомобилей пока нет. Добавьте первый.' : 'Автомобилей пока нет') : 'Ничего не найдено'}</div>
      ) : view === 'table' ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Номер</th>
                <th className="table__th">Машина</th>
                <th className="table__th">Водитель</th>
                {!isOwner && <th className="table__th table__num">Ставка / день</th>}
                <th className="table__th table__num">Пробег</th>
                <th className="table__th">Статус</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="table__row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cars/${c.id}`)}>
                  <td className="table__td"><Plate value={c.plate} /></td>
                  <td className="table__td">
                    <div style={{ fontWeight: 500 }}>{c.brand} {c.model}</div>
                    <div className="muted small">{[c.year, c.color, c.branch_name].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="table__td">{c.driver_name || <span className="muted">—</span>}</td>
                  {!isOwner && <td className="table__td table__num">{fmtMoney(c.daily_rate)}</td>}
                  <td className="table__td table__num">{c.mileage != null ? `${fmtNumber(c.mileage)} км` : '—'}</td>
                  <td className="table__td"><StatusMark status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="car-grid car-grid--tiles">
          {shown.map((c) => (
            <CarTile key={c.id} car={c} onEdit={canEdit ? setEditing : undefined}>
              <div className="ct__row">
                <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.driver_name || 'Без водителя'}</span>
                <StatusMark status={c.status} />
              </div>
              {!isOwner && <div className="ct__row"><span className="muted">Ставка</span><b>{fmtMoney(c.daily_rate)} / день</b></div>}
              <div className="ct__row"><span className="muted">Пробег</span><b>{c.mileage != null ? `${fmtNumber(c.mileage)} км` : '—'}</b></div>
            </CarTile>
          ))}
        </div>
      )}

      {creating && (
        <CarForm
          onClose={() => setCreating(false)}
          onSaved={(car) => { setCreating(false); navigate(`/cars/${car.id}`); }}
        />
      )}
      {editing && (
        <CarForm
          car={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchCars(); }}
        />
      )}
    </div>
  );
}
