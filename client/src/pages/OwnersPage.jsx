import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import Modal from '../components/Modal';
import { initials } from '../labels';

const EMPTY = { name: '', contact_person: '', phone: '', email: '', bank_details: '' };

function OwnerForm({ owner, onClose, onSaved }) {
  const [form, setForm] = useState(owner ? {
    name: owner.name || '',
    contact_person: owner.contact_person || '',
    phone: owner.phone || '',
    email: owner.email || '',
    bank_details: owner.bank_details || '',
  } : EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (owner) await api.patch(`/owners/${owner.id}`, form);
      else await api.post('/owners', form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
      setSaving(false);
    }
  }

  return (
    <Modal title={owner ? 'Изменить арендодателя' : 'Новый арендодатель'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field__label" htmlFor="of-name">Название или ФИО *</label>
          <input id="of-name" className="field__input" value={form.name} onChange={set('name')} required placeholder='ООО "Автопарк" или Иванов И.И.' autoFocus />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="of-contact">Контактное лицо</label>
          <input id="of-contact" className="field__input" value={form.contact_person} onChange={set('contact_person')} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="of-phone">Телефон *</label>
          <input id="of-phone" className="field__input" type="tel" value={form.phone} onChange={set('phone')} required placeholder="+998901234567" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="of-email">Email</label>
          <input id="of-email" className="field__input" type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="of-bank">Реквизиты</label>
          <textarea id="of-bank" className="field__input" rows="3" style={{ paddingTop: 8 }} value={form.bank_details} onChange={set('bank_details')} placeholder="ИНН, счёт, банк" />
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="form-actions">
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Сохраняю…' : owner ? 'Сохранить' : 'Добавить'}</button>
          <button className="btn btn--quiet" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </Modal>
  );
}

export default function OwnersPage() {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setOwners(await api.get('/owners'));
      setError('');
    } catch {
      setError('Не удалось загрузить арендодателей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function archive(owner) {
    if (!window.confirm(`Убрать «${owner.name}» в архив?`)) return;
    try {
      await api.post(`/owners/${owner.id}/archive`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось');
    }
  }

  const active = owners.filter((o) => o.status !== 'ARCHIVED');
  const archived = owners.filter((o) => o.status === 'ARCHIVED');
  const totalCars = active.reduce((s, o) => s + Number(o.active_cars_count || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Арендодатели</h1>
          <p className="page-sub">{active.length} арендодателей · {totalCars} машин в парке</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>+ Добавить арендодателя</button>
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {loading ? <div className="muted">Загрузка…</div> : active.length === 0 ? (
        <div className="empty">Арендодателей пока нет. Добавьте первого.</div>
      ) : (
        <div className="person-grid">
          {active.map((o) => {
            const cars = Number(o.active_cars_count || 0);
            return (
              <div key={o.id} className="person">
                <div className="person__head">
                  <div className="avatar">{initials(o.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="person__name">{o.name}</div>
                    <div className="person__sub">{o.contact_person || 'контакт не указан'}</div>
                  </div>
                </div>
                <div className="badges">
                  <span className={`badge ${cars ? 'badge--wait' : 'badge--muted'}`}>{cars ? `${cars} ${cars === 1 ? 'машина' : cars < 5 ? 'машины' : 'машин'}` : 'Нет машин'}</span>
                </div>
                <dl className="person__facts">
                  <div><dt>Телефон</dt><dd>{o.phone ? <a href={`tel:${o.phone}`} style={{ color: 'inherit' }}>{o.phone}</a> : '—'}</dd></div>
                  <div><dt>Email</dt><dd>{o.email || '—'}</dd></div>
                  {o.bank_details && <div style={{ gridColumn: '1 / -1' }}><dt>Реквизиты</dt><dd className="small">{o.bank_details}</dd></div>}
                </dl>
                <div className="person__actions">
                  <button className="btn btn--quiet btn--sm" onClick={() => setEditing(o)}>Изменить</button>
                  {!cars && <button className="btn btn--ghost btn--sm" onClick={() => archive(o)}>В архив</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>Архив ({archived.length})</summary>
          <div className="person-grid" style={{ marginTop: 12 }}>
            {archived.map((o) => (
              <div key={o.id} className="person">
                <div className="person__head">
                  <div className="avatar avatar--muted">{initials(o.name)}</div>
                  <div><div className="person__name">{o.name}</div><div className="person__sub">{o.phone}</div></div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {editing && (
        <OwnerForm
          owner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
