import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../api';

export default function BranchesPage() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showDialog, setShowDialog] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
  });
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/branches');
      setBranches(data);
    } catch (err) {
      setError('Не удалось загрузить филиалы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  function openCreateDialog() {
    setEditingBranch(null);
    setFormData({ name: '', address: '' });
    setDialogError('');
    setShowDialog(true);
  }

  function openEditDialog(branch) {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address || '',
    });
    setDialogError('');
    setShowDialog(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setDialogError('');
    setSaving(true);
    try {
      if (editingBranch) {
        await api.patch(`/branches/${editingBranch.id}`, formData);
      } else {
        await api.post('/branches', formData);
      }
      setShowDialog(false);
      fetchBranches();
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(branch) {
    if (!window.confirm(`Архивировать филиал "${branch.name}"?`)) return;
    try {
      await api.post(`/branches/${branch.id}/archive`);
      fetchBranches();
    } catch (err) {
      alert('Ошибка: ' + (err.message || 'Неизвестная ошибка'));
    }
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Филиалы</h1>
      <p className="page-sub">
        {branches.length > 0 ? `${branches.length} филиалов` : 'Филиалов пока нет'}
      </p>

      <div style={{ marginBottom: 'var(--sp-4)' }}>
        <button className="btn" onClick={openCreateDialog}>
          Добавить филиал
        </button>
      </div>

      {branches.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Филиалов нет. Добавьте первый.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Название</th>
                  <th className="table__th">Адрес</th>
                  <th className="table__th">Дата создания</th>
                  <th className="table__th">Действия</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="table__row">
                    <td className="table__td" style={{ fontWeight: 500 }}>{b.name}</td>
                    <td className="table__td">{b.address || '—'}</td>
                    <td className="table__td" style={{ fontSize: 'var(--fs-s)' }}>
                      {new Date(b.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="table__td">
                      <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                        <button
                          className="btn btn--quiet"
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => openEditDialog(b)}
                        >
                          Изменить
                        </button>
                        <button
                          className="btn btn--danger"
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => handleArchive(b)}
                        >
                          Архивировать
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="queue">
            {branches.map((b) => (
              <li key={b.id} className="queue__row">
                <div>
                  <div style={{ fontWeight: 500 }}>{b.name}</div>
                  <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {b.address || 'Адрес не указан'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                  <button
                    className="btn btn--quiet"
                    style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                    onClick={() => openEditDialog(b)}
                  >
                    Изменить
                  </button>
                  <button
                    className="btn btn--danger"
                    style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                    onClick={() => handleArchive(b)}
                  >
                    Архив
                  </button>
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
          {editingBranch ? 'Редактирование филиала' : 'Новый филиал'}
        </h2>

        <form onSubmit={handleSave}>
          <div className="field">
            <label className="field__label" htmlFor="name">Название</label>
            <input
              id="name"
              className="field__input"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Ташкент, Центральный"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="address">Адрес</label>
            <input
              id="address"
              className="field__input"
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="ул. Амира Темура, 1"
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
              {saving ? 'Сохранение...' : editingBranch ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}