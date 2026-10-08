import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';
import StatusMark from '../components/StatusMark';

export default function OwnersPage() {
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showDialog, setShowDialog] = useState(false);
  const [editingOwner, setEditingOwner] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    bank_details: '',
  });
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOwners = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/owners');
      setOwners(data);
    } catch (err) {
      setError('Не удалось загрузить арендодателей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  function openCreateDialog() {
    setEditingOwner(null);
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      bank_details: '',
    });
    setDialogError('');
    setShowDialog(true);
  }

  function openEditDialog(owner) {
    setEditingOwner(owner);
    setFormData({
      name: owner.name || '',
      contact_person: owner.contact_person || '',
      phone: owner.phone || '',
      email: owner.email || '',
      bank_details: owner.bank_details || '',
    });
    setDialogError('');
    setShowDialog(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setDialogError('');
    setSaving(true);
    try {
      const body = {
        name: formData.name,
        contact_person: formData.contact_person || undefined,
        phone: formData.phone,
        email: formData.email || undefined,
        bank_details: formData.bank_details || undefined,
      };

      if (editingOwner) {
        await api.patch(`/owners/${editingOwner.id}`, body);
      } else {
        await api.post('/owners', body);
      }
      setShowDialog(false);
      fetchOwners();
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(owner) {
    if (!window.confirm(`Архивировать арендодателя "${owner.name}"?`)) return;
    try {
      await api.post(`/owners/${owner.id}/archive`);
      fetchOwners();
    } catch (err) {
      alert('Ошибка: ' + (err.message || 'Неизвестная ошибка'));
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Арендодатели</h1>
      <p className="page-sub">
        {owners.length > 0 ? `${owners.length} арендодателей` : 'Арендодателей пока нет'}
      </p>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <button className="btn" onClick={openCreateDialog}>
          Добавить арендодателя
        </button>
      </div>

      {owners.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Арендодателей нет. Добавьте первого.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Название / ФИО</th>
                  <th className="table__th">Контактное лицо</th>
                  <th className="table__th">Телефон</th>
                  <th className="table__th">Статус</th>
                  <th className="table__th">Действия</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.id} className="table__row">
                    <td className="table__td" style={{ fontWeight: 500 }}>{o.name}</td>
                    <td className="table__td">{o.contact_person || '—'}</td>
                    <td className="table__td">{o.phone}</td>
                    <td className="table__td">
                      <StatusMark status={o.status} />
                    </td>
                    <td className="table__td">
                      <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                        <button
                          className="btn btn--quiet"
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => openEditDialog(o)}
                        >
                          Изменить
                        </button>
                        {o.status === 'ACTIVE' && (
                          <button
                            className="btn btn--danger"
                            style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                            onClick={() => handleArchive(o)}
                          >
                            Архивировать
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="queue">
            {owners.map((o) => (
              <li key={o.id} className="queue__row">
                <div>
                  <div style={{ fontWeight: 500 }}>{o.name}</div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {o.phone}
                  </div>
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <StatusMark status={o.status} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                  <button
                    className="btn btn--quiet"
                    style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                    onClick={() => openEditDialog(o)}
                  >
                    Изменить
                  </button>
                  {o.status === 'ACTIVE' && (
                    <button
                      className="btn btn--danger"
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                      onClick={() => handleArchive(o)}
                    >
                      Архив
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <dialog
        className="dialog"
        open={showDialog}
        onCancel={() => setShowDialog(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false); }}
      >
        <h2 style={{ marginTop: 0 }} className="page-title">
          {editingOwner ? 'Редактирование арендодателя' : 'Новый арендодатель'}
        </h2>

        <form onSubmit={handleSave}>
          <div className="field">
            <label className="field__label" htmlFor="name">Название организации или ФИО *</label>
            <input
              id="name"
              className="field__input"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder='ООО "Автопарк" или Иванов И.И.'
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="contact_person">Контактное лицо</label>
            <input
              id="contact_person"
              className="field__input"
              type="text"
              value={formData.contact_person}
              onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              placeholder="Иванов Иван Иванович"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="phone">Телефон *</label>
            <input
              id="phone"
              className="field__input"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="+998901234567"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="email">Email</label>
            <input
              id="email"
              className="field__input"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="info@example.com"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="bank_details">Банковские реквизиты</label>
            <textarea
              id="bank_details"
              className="field__input"
              rows="3"
              value={formData.bank_details}
              onChange={(e) => setFormData({ ...formData, bank_details: e.target.value })}
              placeholder="ИНН, расчетный счет, банк"
            />
          </div>

          {dialogError && <p className="field__error">{dialogError}</p>}

          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
            <button
              className="btn btn--quiet"
              type="button"
              onClick={() => setShowDialog(false)}
            >
              Отмена
            </button>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : editingOwner ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}