import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, ApiError } from '../api';
import Modal from './Modal';
import { fmtDateTime } from '../labels';

function WaitlistForm({ entry, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: entry?.full_name || '',
    phone: entry?.phone || '+998',
    wanted_car: entry?.wanted_car || '',
    comment: entry?.comment || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (entry) await api.patch(`/driver-waitlist/${entry.id}`, form);
      else await api.post('/driver-waitlist', form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title={entry ? 'Изменить запись' : 'Записать в лист ожидания'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="wl-name">Имя *</label>
          <input id="wl-name" className="field__input" value={form.full_name} onChange={set('full_name')} required autoFocus placeholder="Как представился водитель" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="wl-phone">Телефон *</label>
          <input id="wl-phone" className="field__input" type="tel" value={form.phone} onChange={set('phone')} required placeholder="+998901234567" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="wl-car">Какую машину просил</label>
          <input id="wl-car" className="field__input" value={form.wanted_car} onChange={set('wanted_car')} placeholder="Например: Cobalt, любая на газу" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="wl-comment">Комментарий</label>
          <textarea id="wl-comment" className="field__input" rows="3" style={{ paddingTop: 8 }} value={form.comment} onChange={set('comment')} placeholder="Когда удобно звонить, опыт, откуда узнал…" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : entry ? 'Сохранить' : 'Записать'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DriverWaitlist({ query, creating, onCreatingChange, onCountChange }) {
  const [entries, setEntries] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get(`/driver-waitlist${showClosed ? '?closed=1' : ''}`);
      setEntries(list);
      onCountChange?.(list.filter((e) => e.status === 'WAITING').length);
      setError('');
    } catch {
      setError('Не удалось загрузить лист ожидания');
    } finally {
      setLoading(false);
    }
  }, [showClosed, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => [e.full_name, e.phone, e.wanted_car, e.comment]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [entries, query]);

  async function act(e, action) {
    if (action === 'delete' && !window.confirm(`Удалить запись «${e.full_name}»?`)) return;
    try {
      if (action === 'delete') await api.delete(`/driver-waitlist/${e.id}`);
      else await api.post(`/driver-waitlist/${e.id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    }
  }

  return (
    <div>
      <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        Показать закрытые
      </label>

      {error && <div className="notice notice--error">{error}</div>}
      {loading ? <div className="muted">Загрузка…</div> : shown.length === 0 ? (
        <div className="empty">{entries.length ? 'Ничего не найдено' : 'В листе ожидания пока никого нет. Если водитель звонит, а свободной машины нет — запишите его сюда.'}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="table__th">Имя</th>
                <th className="table__th">Телефон</th>
                <th className="table__th">Просил машину</th>
                <th className="table__th">Комментарий</th>
                <th className="table__th">Записан</th>
                <th className="table__th">Статус</th>
                <th className="table__th" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="table__row">
                  <td className="table__td"><strong>{e.full_name}</strong></td>
                  <td className="table__td"><a href={`tel:${e.phone}`}>{e.phone}</a></td>
                  <td className="table__td">{e.wanted_car || '—'}</td>
                  <td className="table__td muted small" style={{ maxWidth: '18rem', whiteSpace: 'pre-wrap' }}>{e.comment || '—'}</td>
                  <td className="table__td small">
                    {fmtDateTime(e.created_at)}
                    {e.author_name && <div className="muted">{e.author_name}</div>}
                  </td>
                  <td className="table__td">
                    {e.status === 'WAITING'
                      ? <span className="badge badge--wait">Ждёт</span>
                      : <span className="badge badge--muted">Закрыто</span>}
                  </td>
                  <td className="table__td" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {e.status === 'WAITING'
                      ? <button className="btn btn--quiet btn--sm" onClick={() => act(e, 'close')} title="Машину нашли или уже не актуально">Закрыть</button>
                      : <button className="btn btn--quiet btn--sm" onClick={() => act(e, 'reopen')}>Вернуть</button>}
                    {' '}
                    <button className="btn btn--quiet btn--sm" onClick={() => setEditing(e)}>Изменить</button>
                    {' '}
                    <button className="btn btn--danger btn--sm" onClick={() => act(e, 'delete')}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <WaitlistForm
          entry={editing}
          onClose={() => { setEditing(null); onCreatingChange(false); }}
          onSaved={() => { setEditing(null); onCreatingChange(false); load(); }}
        />
      )}
    </div>
  );
}
