import { useRef, useState, useEffect } from 'react';
import { api, ApiError } from '../api';
import Money from './Money';

export default function ConfirmPaymentDialog({ payment, onClose, onConfirmed }) {
  const dialogRef = useRef(null);
  const [amount, setAmount] = useState('');
  const [shortageReason, setShortageReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (payment && dialogRef.current) {
      dialogRef.current.showModal();
      setAmount(String(payment.amount_declared));
      setShortageReason('');
      setError('');
    }
  }, [payment]);

  if (!payment) return null;

  const isShortage = Number(amount) < payment.amount_declared;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = { amount_dispatcher: Number(amount) };
      if (isShortage) {
        if (!shortageReason.trim()) {
          setError('Укажите причину нехватки');
          setLoading(false);
          return;
        }
        body.shortage_reason = shortageReason.trim();
      }

      await api.patch(`/payments/${payment.id}/confirm`, body);
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
        // Закрытие по клику на подложку (сам <dialog>)
        if (e.target === dialogRef.current) handleCancel();
      }}
    >
      <h2 style={{ marginTop: 0 }} className="page-title">Подтверждение платежа</h2>
      <p className="page-sub">
        Водитель заявил: <Money value={payment.amount_declared} />
      </p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label" htmlFor="amount">Фактически принято, сум</label>
          <input
            id="amount"
            className="field__input"
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            min="1"
          />
        </div>

        {isShortage && (
          <div className="field">
            <label className="field__label" htmlFor="reason">Причина нехватки</label>
            <textarea
              id="reason"
              className="field__input"
              rows="3"
              value={shortageReason}
              onChange={(e) => setShortageReason(e.target.value)}
              required
              placeholder="Например: водитель обещал довезти завтра"
            />
          </div>
        )}

        {error && <p className="field__error">{error}</p>}

        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
          <button className="btn btn--quiet" type="button" onClick={handleCancel}>
            Отмена
          </button>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Сохранение...' : 'Подтвердить'}
          </button>
        </div>
      </form>
    </dialog>
  );
}