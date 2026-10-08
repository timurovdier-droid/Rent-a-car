import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const data = await api.get('/notifications');
        setNotifications(data);
      } catch (err) {
        setError('Не удалось загрузить уведомления');
      } finally {
        setLoading(false);
      }
    }
    fetchNotifications();
  }, []);

  function handleClick(notification) {
    if (!notification.object_type || !notification.object_id) return;

    const routes = {
      driver: '/drivers',
      payment: '/payments-queue',
      service_record: '/service',
    };

    const route = routes[notification.object_type];
    if (route) navigate(route);
  }

  function getTypeStyles(type) {
    switch (type) {
      case 'DANGER':
        return {
          border: '1px solid var(--c-bad)',
          background: 'rgb(220 38 38 / 0.05)',
          label: 'Критично',
          labelColor: 'var(--c-bad)',
        };
      case 'WARNING':
        return {
          border: '1px solid var(--c-warn)',
          background: 'rgb(202 138 4 / 0.05)',
          label: 'Внимание',
          labelColor: 'var(--c-warn)',
        };
      case 'INFO':
        return {
          border: '1px solid var(--c-border)',
          background: 'var(--c-bg)',
          label: 'Информация',
          labelColor: 'var(--c-muted)',
        };
      default:
        return {
          border: '1px solid var(--c-border)',
          background: 'var(--c-bg)',
          label: 'Уведомление',
          labelColor: 'var(--c-muted)',
        };
    }
  }

  function getCategoryLabel(category) {
    const map = {
      LICENSE: 'Водительские права',
      PAYMENT: 'Платежи',
      SERVICE: 'Обслуживание',
      DRIVER: 'Водители',
    };
    return map[category] || category;
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  const dangerCount = notifications.filter(n => n.type === 'DANGER').length;
  const warningCount = notifications.filter(n => n.type === 'WARNING').length;

  return (
    <div>
      <h1 className="page-title">Уведомления</h1>
      <p className="page-sub">
        {notifications.length > 0
          ? `${notifications.length} активных уведомлений`
          : 'Всё в порядке — уведомлений нет'}
      </p>

      {/* Сводка */}
      {notifications.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {dangerCount > 0 && (
            <div className="card" style={{ borderColor: 'var(--c-bad)', flex: '1 1 10rem' }}>
              <div style={{ color: 'var(--c-bad)', fontSize: 'var(--fs-s)', fontWeight: 600 }}>
                Критичных
              </div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>{dangerCount}</div>
            </div>
          )}
          {warningCount > 0 && (
            <div className="card" style={{ borderColor: 'var(--c-warn)', flex: '1 1 10rem' }}>
              <div style={{ color: 'var(--c-warn)', fontSize: 'var(--fs-s)', fontWeight: 600 }}>
                Требуют внимания
              </div>
              <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>{warningCount}</div>
            </div>
          )}
          <div className="card" style={{ flex: '1 1 10rem' }}>
            <div style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)', fontWeight: 600 }}>
              Всего
            </div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600 }}>{notifications.length}</div>
          </div>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--sp-5)' }}>
          <div style={{ fontSize: 'var(--fs-l)', marginBottom: 'var(--sp-2)' }}>✓</div>
          <p style={{ color: 'var(--c-muted)', margin: 0 }}>
            Нет просроченных платежей, истекающих документов или незавершённых ТО.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {notifications.map((n) => {
            const styles = getTypeStyles(n.type);
            return (
              <div
                key={n.id}
                className="card"
                style={{
                  border: styles.border,
                  background: styles.background,
                  cursor: n.object_type ? 'pointer' : 'default',
                  transition: 'transform 0.1s',
                }}
                onClick={() => handleClick(n)}
                onMouseEnter={(e) => {
                  if (n.object_type) e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-2)', marginBottom: 'var(--sp-1)' }}>
                  <div style={{ fontSize: 'var(--fs-m)', fontWeight: 600 }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: 'var(--fs-s)',
                    fontWeight: 600,
                    color: styles.labelColor,
                    whiteSpace: 'nowrap',
                    padding: 'var(--sp-1) var(--sp-2)',
                    background: 'var(--c-bg)',
                    borderRadius: 'var(--radius)',
                  }}>
                    {styles.label}
                  </div>
                </div>
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-text)', marginBottom: 'var(--sp-2)' }}>
                  {n.message}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                  <span>{getCategoryLabel(n.category)}</span>
                  <span>{new Date(n.created_at).toLocaleString('ru-RU')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}