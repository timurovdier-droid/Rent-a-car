import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import DriverForm from '../components/DriverForm';
import DriverWaitlist from '../components/DriverWaitlist';
import { fmtMoney, fmtDay, todayLocal, shiftDay, initials } from '../labels';

function licenseBadge(day) {
  if (!day) return null;
  const today = todayLocal();
  const value = String(day).slice(0, 10);
  if (value < today) return <span className="badge badge--danger">ВУ просрочено</span>;
  if (value <= shiftDay(today, 30)) return <span className="badge badge--warn">ВУ до {fmtDay(value)}</span>;
  return null;
}

export default function DriversPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const [mode, setMode] = useState('active');
  const archived = mode === 'archived';
  const waitlist = mode === 'waitlist';
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [addingWait, setAddingWait] = useState(false);
  const [waitCount, setWaitCount] = useState(null);

  const load = useCallback(async () => {
    if (waitlist) return;
    setLoading(true);
    try {
      setDrivers(await api.get(`/drivers${archived ? '?archived=1' : ''}`));
      setError('');
    } catch {
      setError('Не удалось загрузить водителей');
    } finally {
      setLoading(false);
    }
  }, [archived, waitlist]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/driver-waitlist').then((list) => setWaitCount(list.length)).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => [d.full_name, d.phone, d.login, d.car_plate, d.passport]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [drivers, query]);

  async function act(d, action) {
    if (action !== 'restore' && d.car_plate) {
      setError(`Сначала примите у ${d.full_name} машину ${d.car_plate} — на странице машины, вкладка «Водитель»`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const texts = {
      archive: `Убрать ${d.full_name} в архив?`,
      restore: `Вернуть ${d.full_name} из архива?`,
      delete: `Удалить ${d.full_name} навсегда? Это действие нельзя отменить.`,
    };
    if (!window.confirm(texts[action])) return;
    try {
      if (action === 'delete') await api.delete(`/drivers/${d.id}`);
      else await api.post(`/drivers/${d.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    }
  }

  const subtitle = waitlist
    ? 'Водители, которые просили машину, когда свободной не было'
    : `${archived ? 'Архив' : `${drivers.length} активных`} · откройте карточку, чтобы изменить данные или депозит`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Водители</h1>
          <p className="page-sub">{subtitle}</p>
        </div>
        {mode === 'active' && <button className="btn" onClick={() => setCreating(true)}>+ Добавить водителя</button>}
        {waitlist && <button className="btn" onClick={() => setAddingWait(true)}>+ Записать в ожидание</button>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input
          className="field__input"
          style={{ flex: '1 1 16rem', maxWidth: '24rem' }}
          placeholder={waitlist ? 'Поиск: имя, телефон, машина' : 'Поиск: имя, телефон, номер машины'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          <button type="button" className={`chip ${mode === 'active' ? 'chip--on' : ''}`} onClick={() => setMode('active')}>Активные</button>
          <button type="button" className={`chip ${archived ? 'chip--on' : ''}`} onClick={() => setMode('archived')}>Архив</button>
          <button type="button" className={`chip ${waitlist ? 'chip--on' : ''}`} onClick={() => setMode('waitlist')}>
            Лист ожидания{waitCount ? ` · ${waitCount}` : ''}
          </button>
        </div>
      </div>

      {waitlist ? (
        <DriverWaitlist query={query} creating={addingWait} onCreatingChange={setAddingWait} onCountChange={setWaitCount} />
      ) : (
        <>
          {error && <div className="notice notice--error">{error}</div>}
          {loading ? <div className="muted">Загрузка…</div> : shown.length === 0 ? (
            <div className="empty">{archived ? 'В архиве никого нет' : drivers.length ? 'Ничего не найдено' : 'Водителей пока нет. Добавьте первого.'}</div>
          ) : (
            <div className="person-grid">
              {shown.map((d) => (
                <div key={d.id} className="person person--link" style={{ cursor: 'pointer' }} onClick={() => navigate(`/drivers/${d.id}`)}>
                  <div className="person__head">
                    <div className={`avatar ${archived ? 'avatar--muted' : ''}`}>{initials(d.full_name)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="person__name">{d.full_name}</div>
                      <div className="person__sub">{d.phone || 'телефон не указан'}</div>
                    </div>
                  </div>
                  <div className="badges">
                    {d.car_plate
                      ? <span className="badge badge--wait">На машине {d.car_plate}</span>
                      : <span className="badge badge--muted">{archived ? 'В архиве' : 'Свободен'}</span>}
                    {licenseBadge(d.license_expires)}
                  </div>
                  <dl className="person__facts">
                    <div><dt>Депозит</dt><dd>{fmtMoney(d.deposit)} сум</dd></div>
                    <div><dt>ВУ</dt><dd>{d.license_no || '—'}</dd></div>
                  </dl>
                  <div className="person__actions" onClick={(e) => e.stopPropagation()}>
                    {archived
                      ? <button className="btn btn--quiet btn--sm" onClick={() => act(d, 'restore')}>Вернуть</button>
                      : <button className="btn btn--ghost btn--sm" onClick={() => act(d, 'archive')}>В архив</button>}
                    {isAdmin && <button className="btn btn--danger btn--sm" onClick={() => act(d, 'delete')}>Удалить навсегда</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!archived && !loading && drivers.length > 0 && (
            <p className="muted small" style={{ marginTop: 16 }}>Выдать машину водителю можно на странице машины — <Link to="/cars">Автомобили</Link>.</p>
          )}
        </>
      )}

      {creating && (
        <DriverForm onClose={() => setCreating(false)} onSaved={(d) => { setCreating(false); navigate(`/drivers/${d.id}`); }} />
      )}
    </div>
  );
}
