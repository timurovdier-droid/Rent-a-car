import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const CATEGORY = {
  DOCUMENT: 'Документы машины',
  SERVICE: 'Обслуживание',
  PAYMENT: 'Записи на подтверждение',
  LICENSE: 'Водительские права',
};

const FILTERS = [
  { id: 'ALL', label: 'Все' },
  { id: 'DANGER', label: 'Срочно' },
  { id: 'WARNING', label: 'Скоро' },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    api.get('/notifications')
      .then(setItems)
      .catch(() => setError('Не удалось загрузить уведомления'))
      .finally(() => setLoading(false));
  }, []);

  function open(n) {
    if (n.object_type === 'car' && n.object_id) navigate(`/cars/${n.object_id}`);
    if (n.object_type === 'driver' && n.object_id) navigate(`/drivers/${n.object_id}`);
  }

  if (loading) return <div className="muted">Загрузка…</div>;

  const danger = items.filter((n) => n.type === 'DANGER').length;
  const warning = items.filter((n) => n.type === 'WARNING').length;
  const shown = filter === 'ALL' ? items : items.filter((n) => n.type === filter);

  return (
    <div>
      <h1 className="page-title">Уведомления</h1>
      <p className="page-sub">
        {items.length ? `Срочно: ${danger} · Скоро: ${warning}` : 'Всё в порядке — уведомлений нет'}
      </p>

      {error && <div className="notice notice--error">{error}</div>}

      {items.length > 0 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`chip ${filter === f.id ? 'chip--on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">Нет просроченных документов, ТО и неподтверждённых записей.</div>
      ) : (
        <ul className="tx-list panel" style={{ padding: '4px 16px' }}>
          {shown.map((n) => {
            const urgent = n.type === 'DANGER';
            return (
              <li key={n.id} className="tx" style={{ cursor: n.object_id ? 'pointer' : 'default' }} onClick={() => open(n)}>
                <div className={`tx__icon ${urgent ? 'tx__icon--out' : 'tx__icon--warn'}`}>!</div>
                <div>
                  <div className="tx__title">{n.title}</div>
                  <div className="tx__meta">{CATEGORY[n.category] || n.category} · {n.message}</div>
                </div>
                <div className="tx__right">
                  <span className={`badge ${urgent ? 'badge--danger' : 'badge--warn'}`}>{urgent ? 'Срочно' : 'Скоро'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
