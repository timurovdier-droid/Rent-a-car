import { useState, useEffect } from 'react';
import { api, ApiError } from '../api';

const FIELDS = [
  { key: 'company_name', label: 'Название компании', type: 'text' },
  { key: 'currency', label: 'Валюта', type: 'text' },
  { key: 'timezone', label: 'Часовой пояс', type: 'text' },
  { key: 'min_payment_amount', label: 'Минимальная сумма платежа', type: 'number', suffix: 'сум' },
  { key: 'max_failed_attempts', label: 'Максимум неудачных попыток входа', type: 'number' },
  { key: 'lock_duration_minutes', label: 'Длительность блокировки', type: 'number', suffix: 'мин' },
  { key: 'remind_days', label: 'Напоминать о документах и ТО за', type: 'number', suffix: 'дней' },
  { key: 'remind_km', label: 'Напоминать о ТО за', type: 'number', suffix: 'км' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get('/settings');
        setSettings(data);
        setDraft(data);
      } catch (err) {
        setError('Не удалось загрузить настройки');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const updated = await api.patch('/settings', draft);
      setSettings(updated);
      setDraft(updated);
      setSuccess('Настройки сохранены');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(settings || {});
    setError('');
    setSuccess('');
  }

  if (loading) return <div>Загрузка...</div>;

  return (
    <div>
      <h1 className="page-title">Настройки системы</h1>
      <p className="page-sub">Глобальные параметры, применяемые ко всей системе</p>

      <form onSubmit={handleSave} style={{ maxWidth: '32rem' }}>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label className="field__label" htmlFor={f.key}>{f.label}</label>
            <input
              id={f.key}
              className="field__input"
              type={f.type}
              value={draft[f.key] ?? ''}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              min={f.type === 'number' ? '0' : undefined}
            />
            {f.suffix && (
              <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)', marginTop: 'var(--sp-1)' }}>
                Единица измерения: {f.suffix}
              </div>
            )}
          </div>
        ))}

        {error && <p className="field__error">{error}</p>}
        {success && <p style={{ color: 'var(--c-ok)', fontWeight: 500 }}>{success}</p>}

        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
          <button className="btn btn--quiet" type="button" onClick={handleReset} disabled={saving}>
            Сбросить
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}