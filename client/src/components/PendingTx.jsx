import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import TxList from './TxList';
import DriverPaymentRequests from './DriverPaymentRequests';
import { fmtMoney } from '../labels';

export default function PendingTx({ onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.get('/reports/pending-transactions'));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить записи на подтверждение');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function changed() {
    load();
    onChanged?.();
  }

  async function confirmAll() {
    if (!items?.length) return;
    if (!window.confirm(`Подтвердить все записи (${items.length} шт.)?`)) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/reports/pending-transactions/confirm', { ids: items.map((t) => t.id) });
      changed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось подтвердить');
    } finally {
      setSaving(false);
    }
  }

  const income = (items || []).filter((t) => t.kind === 'INCOME').reduce((s, t) => s + Number(t.amount), 0);
  const expense = (items || []).filter((t) => t.kind === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Оплаты, которые водители отправили из кабинета, и доходы/расходы, которые добавили диспетчеры. Пока вы их не подтвердите, они не входят в доход и долг.
      </p>

      <DriverPaymentRequests onChanged={onChanged} />

      {error && <div className="notice notice--error">{error}</div>}
      {!items && !error && <div className="muted">Загрузка…</div>}
      {items && (
        <>
          {items.length > 0 && (
            <div className="ledger-box__head" style={{ marginBottom: 12 }}>
              <div className="ledger-sum">
                <div className="ledger-sum__item">
                  <span className="ledger-sum__label">Записей</span>
                  <b>{items.length}</b>
                </div>
                <div className="ledger-sum__item">
                  <span className="ledger-sum__label">Доходы</span>
                  <b>{fmtMoney(income)}</b>
                </div>
                <div className="ledger-sum__item">
                  <span className="ledger-sum__label">Расходы</span>
                  <b>{fmtMoney(expense)}</b>
                </div>
              </div>
              <button type="button" className="btn btn--ok" onClick={confirmAll} disabled={saving}>
                {saving ? 'Подтверждаю…' : 'Подтвердить все'}
              </button>
            </div>
          )}
          <TxList
            items={items}
            role="ADMIN"
            showCar
            onChanged={changed}
            title="Записи от диспетчеров"
            emptyText="Всё подтверждено — новых записей от диспетчеров нет"
          />
        </>
      )}
    </div>
  );
}
