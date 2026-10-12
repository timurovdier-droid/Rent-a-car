import { useState, useEffect } from 'react';
import { api, ApiError } from '../api';
import { AppControls } from '../components/Layout';

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

function parseContacts(value) {
  try {
    const c = value ? JSON.parse(value) : {};
    return { phones: c.phones || [], locations: c.locations || [], telegram: c.telegram || '', note: c.note || '' };
  } catch {
    return { phones: [], locations: [], telegram: '', note: '' };
  }
}

// Контакты и адреса, которые водители видят в разделе «Диспетчер»
function ContactsEditor({ value, onSaved }) {
  const [c, setC] = useState(() => parseContacts(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const setItem = (list, i, patch) => setC({ ...c, [list]: c[list].map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const addItem = (list, item) => setC({ ...c, [list]: [...c[list], item] });
  const dropItem = (list, i) => setC({ ...c, [list]: c[list].filter((_, j) => j !== i) });

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const clean = {
      phones: c.phones.filter((p) => p.phone.trim()),
      locations: c.locations.filter((l) => l.address.trim() || l.name.trim()),
      telegram: c.telegram.trim(),
      note: c.note.trim(),
    };
    try {
      const updated = await api.patch('/settings', { contacts: JSON.stringify(clean) });
      setC(parseContacts(updated.contacts));
      onSaved(updated);
      setMessage('Контакты сохранены — водители уже их видят');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="panel" style={{ maxWidth: '40rem', marginBottom: 'var(--sp-5)' }}>
      <h2 className="panel__title">Контакты для водителей</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Водители видят это в разделе «Диспетчер»: могут позвонить в одно касание и открыть адрес на карте.</p>

      <h3 className="field__label">Телефоны</h3>
      {c.phones.map((p, i) => (
        <div key={i} className="contacts-row">
          <input className="field__input" placeholder="Кто (например: Диспетчер Азиз)" value={p.label} onChange={(e) => setItem('phones', i, { label: e.target.value })} maxLength={60} />
          <input className="field__input" placeholder="+998 90 123 45 67" inputMode="tel" value={p.phone} onChange={(e) => setItem('phones', i, { phone: e.target.value })} maxLength={30} />
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => dropItem('phones', i)}>Убрать</button>
        </div>
      ))}
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => addItem('phones', { label: '', phone: '' })}>+ Телефон</button>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field__label" htmlFor="ct-tg">Telegram</label>
        <input id="ct-tg" className="field__input" placeholder="@gta_rent или ссылка" value={c.telegram} onChange={(e) => setC({ ...c, telegram: e.target.value })} maxLength={100} />
      </div>

      <h3 className="field__label">Адреса</h3>
      {c.locations.map((l, i) => (
        <div key={i} className="contacts-loc">
          <input className="field__input" placeholder="Название (например: Офис, Стоянка)" value={l.name} onChange={(e) => setItem('locations', i, { name: e.target.value })} maxLength={60} />
          <input className="field__input" placeholder="Адрес" value={l.address} onChange={(e) => setItem('locations', i, { address: e.target.value })} maxLength={200} />
          <input className="field__input" placeholder="Часы работы (например: 9:00–20:00)" value={l.hours || ''} onChange={(e) => setItem('locations', i, { hours: e.target.value })} maxLength={60} />
          <input className="field__input" placeholder="Ссылка на карту (необязательно)" value={l.map || ''} onChange={(e) => setItem('locations', i, { map: e.target.value })} maxLength={500} />
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => dropItem('locations', i)}>Убрать адрес</button>
        </div>
      ))}
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => addItem('locations', { name: '', address: '', hours: '', map: '' })}>+ Адрес</button>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field__label" htmlFor="ct-note">Примечание</label>
        <textarea id="ct-note" className="field__input" rows={2} placeholder="например: при ДТП сначала звоните диспетчеру" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} maxLength={500} />
      </div>

      {error && <p className="field__error">{error}</p>}
      {message && <p style={{ color: 'var(--c-ok)', fontWeight: 500 }}>{message}</p>}
      <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить контакты'}</button>
    </form>
  );
}

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
      const fields = Object.fromEntries(FIELDS.map((f) => [f.key, draft[f.key] ?? '']));
      const updated = await api.patch('/settings', fields);
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

      <div className="app-controls">
        <AppControls />
      </div>

      <ContactsEditor value={settings?.contacts} onSaved={(s) => { setSettings(s); setDraft((d) => ({ ...d, contacts: s.contacts })); }} />

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