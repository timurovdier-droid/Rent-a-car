import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import Plate from '../components/Plate';
import StatusMark from '../components/StatusMark';
import Money from '../components/Money';
import ConfirmPaymentDialog from '../components/ConfirmPaymentDialog';
import AdminPaymentDialog from '../components/AdminPaymentDialog';

export default function PaymentsQueuePage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [adminSelectedPayment, setAdminSelectedPayment] = useState(null);
  const { user } = useAuth();

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/payments?status=DISPATCHER_PENDING,ADMIN_PENDING');
      setPayments(data);
    } catch (err) {
      setError('Не удалось загрузить очередь платежей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  function handleConfirmed() {
    setSelectedPayment(null);
    setAdminSelectedPayment(null);
    fetchPayments();
  }

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="field__error">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Платежи на подтверждение</h1>
      <p className="page-sub">
        {payments.length > 0 
          ? `${payments.length} платежей на подтверждение` 
          : 'Платежей на подтверждение нет'}
      </p>

      {payments.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Очередь пуста. Новые платежи появятся здесь.</p>
      ) : (
        <>
          {/* Десктоп: таблица */}
          <div className="table-wrap">
            <table className="table table--queue">
              <thead>
                <tr>
                  <th className="table__th">Водитель</th>
                  <th className="table__th">Автомобиль</th>
                  <th className="table__th table__num">Заявил</th>
                  <th className="table__th table__num">Принял</th>
                  <th className="table__th">Статус</th>
                  <th className="table__th">Действия</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="table__row">
                    <td className="table__td">{p.driver_name}</td>
                    <td className="table__td">
                      <Plate value={p.car_plate} />
                    </td>
                    <td className="table__td table__num">
                      <Money value={p.amount_declared} />
                    </td>
                    <td className="table__td table__num">
                      {p.amount_dispatcher ? (
                        <Money value={p.amount_dispatcher} />
                      ) : (
                        <span style={{ color: 'var(--c-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="table__td">
                      <StatusMark status={p.status} />
                    </td>
                    <td className="table__td">
                      {p.status === 'DISPATCHER_PENDING' && user?.role === 'DISPATCHER' && (
                        <button 
                          className="btn" 
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => setSelectedPayment(p)}
                        >
                          Подтвердить
                        </button>
                      )}
                      {p.status === 'ADMIN_PENDING' && user?.role === 'ADMIN' && (
                        <button 
                          className="btn" 
                          style={{ fontSize: 'var(--fs-s)', minHeight: '32px' }}
                          onClick={() => setAdminSelectedPayment(p)}
                        >
                          Подтвердить
                        </button>
                      )}
                      {p.status === 'ADMIN_PENDING' && user?.role === 'DISPATCHER' && (
                        <span style={{ color: 'var(--c-muted)', fontSize: 'var(--fs-s)' }}>
                          Ждёт администратора
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильный: список */}
          <ul className="queue">
            {payments.map((p) => (
              <li key={p.id} className="queue__row">
                <div>
                  <Plate value={p.car_plate} />
                  <div style={{ marginTop: 'var(--sp-1)', fontSize: 'var(--fs-s)', color: 'var(--c-muted)' }}>
                    {p.driver_name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Money value={p.amount_declared} />
                  <div style={{ marginTop: 'var(--sp-1)' }}>
                    <StatusMark status={p.status} />
                  </div>
                  {p.status === 'DISPATCHER_PENDING' && user?.role === 'DISPATCHER' && (
                    <button 
                      className="btn" 
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px', marginTop: 'var(--sp-2)', width: '100%' }}
                      onClick={() => setSelectedPayment(p)}
                    >
                      Подтвердить
                    </button>
                  )}
                  {p.status === 'ADMIN_PENDING' && user?.role === 'ADMIN' && (
                    <button 
                      className="btn" 
                      style={{ fontSize: 'var(--fs-s)', minHeight: '32px', marginTop: 'var(--sp-2)', width: '100%' }}
                      onClick={() => setAdminSelectedPayment(p)}
                    >
                      Подтвердить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmPaymentDialog
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
        onConfirmed={handleConfirmed}
      />

      <AdminPaymentDialog
        payment={adminSelectedPayment}
        onClose={() => setAdminSelectedPayment(null)}
        onConfirmed={handleConfirmed}
      />
    </div>
  );
}