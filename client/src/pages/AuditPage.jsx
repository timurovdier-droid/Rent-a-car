import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import StatusMark from '../components/StatusMark';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get(`/audit?limit=${LIMIT}&offset=${offset}`);
      setLogs(data);
    } catch (err) {
      setError('Не удалось загрузить журнал аудита');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function formatValue(value) {
    if (!value) return '—';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function formatAction(action) {
    const map = {
      'PAYMENT_CREATED': 'Создан платёж',
      'PAYMENT_DISPATCHER_CONFIRMED': 'Подтверждён диспетчером',
      'PAYMENT_ADMIN_CONFIRM': 'Подтверждён администратором',
      'PAYMENT_ADMIN_REJECT': 'Отклонён администратором',
      'CAR_CREATED': 'Создан автомобиль',
      'CAR_UPDATED': 'Обновлён автомобиль',
      'CAR_ARCHIVED': 'Архивирован автомобиль',
      'DRIVER_CREATED': 'Создан водитель',
      'DRIVER_UPDATED': 'Обновлён водитель',
      'DRIVER_ARCHIVED': 'Архивирован водитель',
      'DISPATCHER_CREATED': 'Создан диспетчер',
      'DISPATCHER_ARCHIVED': 'Архивирован диспетчер',
      'PASSWORD_RESET': 'Сброшен пароль',
    };
    return map[action] || action;
  }

  if (loading && logs.length === 0) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Журнал аудита</h1>
      <p className="page-sub">История всех действий в системе</p>

      {logs.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Записей пока нет</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Время</th>
                  <th className="table__th">Пользователь</th>
                  <th className="table__th">Действие</th>
                  <th className="table__th">Объект</th>
                  <th className="table__th">Детали</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="table__row">
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)', whiteSpace: 'nowrap' }}>
                      {new Date(log.at).toLocaleString('ru-RU')}
                    </td>
                    <td className="table__td">
                      <div>{log.user_name || '—'}</div>
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                        {log.user_login}
                      </div>
                    </td>
                    <td className="table__td">
                      {formatAction(log.action)}
                    </td>
                    <td className="table__td">
                      <div>{log.object_type || '—'}</div>
                      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                        ID: {log.object_id || '—'}
                      </div>
                    </td>
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)', maxWidth: '20rem' }}>
                      {log.old_value && (
                        <details>
                          <summary style={{ cursor: 'pointer', color: 'var(--c-muted)' }}>
                            Было
                          </summary>
                          <pre style={{ margin: '.5rem 0', fontSize: 'var(--fs-s)', overflow: 'auto' }}>
                            {formatValue(log.old_value)}
                          </pre>
                        </details>
                      )}
                      {log.new_value && (
                        <details>
                          <summary style={{ cursor: 'pointer', color: 'var(--c-ok)' }}>
                            Стало
                          </summary>
                          <pre style={{ margin: '.5rem 0', fontSize: 'var(--fs-s)', overflow: 'auto' }}>
                            {formatValue(log.new_value)}
                          </pre>
                        </details>
                      )}
                      {!log.old_value && !log.new_value && (
                        <span style={{ color: 'var(--c-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' }}>
            <button
              className="btn btn--quiet"
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
            >
              ← Назад
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => setOffset(offset + LIMIT)}
              disabled={logs.length < LIMIT}
            >
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  );
}