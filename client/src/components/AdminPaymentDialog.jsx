import { useRef, useState, useEffect } from 'react';
import { api, ApiError } from '../api';
import Money from './Money';

export default function AdminPaymentDialog({ payment, onClose, onConfirmed }) {
  const dialogRef = useRef(null);
  const [action, setAction] = useState('CONFIRM');
  const [amountAdmin, setAmountAdmin] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (payment && dialogRef.current) {
      dialogRef.current.showModal();
      setAction('CONFIRM');
      setAmountAdmin(String(payment.amount_dispatcher || payment.amount_declared));
      setRejectReason('');
      setError('');
    }
  }, [payment]);

  if (!payment) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = { action };
      
      if (action === 'CONFIRM') {
        body.amount_admin = Number(amountAdmin);
      } else {
        if (!rejectReason.trim()) {
          setError('Укажите причину отклонения');
          setLoading(false);
          return;
        }
        body.reject_reason = rejectReason.trim();
      }

      await api.patch(`/payments/${payment.id}/admin-confirm`, body);
      dialogRef.current.close();
      onConfirmed?.();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Произошла ошибка. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    dialogRef.current?.close();
    onClose?.();
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onCancel={handleCancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) handleCancel();
      }}
    >
      <h2 style={{ marginTop: 0 }} className="page-title">Подтверждение администратором</h2>
      <p className="page-sub">
        Водитель заявил: <Money value={payment.amount_declared} /><br />
        Диспетчер принял: <Money value={payment.amount_dispatcher || payment.amount_declared} />
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label">Действие</label>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button
              type="button"
              className={`btn ${action === 'CONFIRM' ? '' : 'btn--quiet'}`}
              onClick={() => setAction('CONFIRM')}
              style={{ flex: 1 }}
            >
              Подтвердить
            </button>
            <button
              type="button"
              className={`btn ${action === 'REJECT' ? 'btn--danger' : 'btn--quiet'}`}
              onClick={() => setAction('REJECT')}
              style={{ flex: 1 }}
            >
              Отклонить
            </button>
          </div>
        </div>

        {action === 'CONFIRM' && (
          <div className="field">
            <label className="field__label" htmlFor="amountAdmin">Итоговая сумма, сум</label>
            <input
              id="amountAdmin"
              className="field__input"
              type="number"
              inputMode="numeric"
              value={amountAdmin}
              onChange={(e) => setAmountAdmin(e.target.value)}
              required
              min="1"
            />
          </div>
        )}

        {action === 'REJECT' && (
          <div className="field">
            <label className="field__label" htmlFor="rejectReason">Причина отклонения</label>
            <textarea
              id="rejectReason"
              className="field__input"
              rows="3"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
              placeholder="Например: чек не соответствует сумме"
            />
          </div>
        )}

        {error && <p className="field__error">{error}</p>}

        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
          <button className="btn btn--quiet" type="button" onClick={handleCancel}>
            Отмена
          </button>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Сохранение...' : action === 'CONFIRM' ? 'Подтвердить' : 'Отклонить'}
          </button>
        </div>
      </form>
    </dialog>
  );
}