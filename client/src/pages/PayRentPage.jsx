import { useState, useEffect } from 'react';
import { api, ApiError } from '../api';
import Plate from '../components/Plate';
import Money from '../components/Money';

function generateIdempotencyKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function PayRentPage() {
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function fetchReports() {
      try {
        const data = await api.get('/daily-reports/my');
        setReports(data);
        if (data.length > 0) {
          setSelectedReportId(String(data[0].id));
        }
      } catch (err) {
        console.error('Ошибка загрузки отчётов:', err);
      } finally {
        setLoadingReports(false);
      }
    }
    fetchReports();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const idempotencyKey = generateIdempotencyKey();

    try {
      await api.post('/payments', {
        daily_report_id: Number(selectedReportId),
        amount_declared: parseInt(amount, 10),
        method,
        receipt_url: receiptUrl || undefined,
      }, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });
      setSuccess('Платёж успешно передан диспетчеру!');
      setAmount('');
      setReceiptUrl('');
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

  if (loadingReports) return <div>Загрузка...</div>;

  return (
    <div>
      <h1 className="page-title">Передача оплаты</h1>
      <p className="page-sub">Внесите оплату за аренду автомобиля</p>

      {reports.length === 0 ? (
        <div className="card" style={{ maxWidth: '28rem' }}>
          <p style={{ color: 'var(--c-muted)', marginBottom: 'var(--sp-3)' }}>
            У вас пока нет дневных отчётов. Сначала создайте отчёт на странице «Дневные отчёты».
          </p>
          <a href="/daily-reports" className="btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Перейти к отчётам
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: '28rem' }}>
          <div className="field">
            <label className="field__label" htmlFor="report">Дневной отчёт</label>
            <select
              id="report"
              className="field__input"
              value={selectedReportId}
              onChange={(e) => setSelectedReportId(e.target.value)}
              required
            >
              <option value="">— выберите отчёт —</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.report_date).toLocaleDateString('ru-RU')} · {r.plate} · {r.brand} {r.model}
                </option>
              ))}
            </select>
          </div>

          {selectedReportId && (
            <div style={{ marginBottom: 'var(--sp-3)', padding: 'var(--sp-2)', background: 'var(--c-bg-soft)', borderRadius: 'var(--radius)' }}>
              {(() => {
                const report = reports.find(r => r.id === Number(selectedReportId));
                if (!report) return null;
                return (
                  <div style={{ fontSize: 'var(--fs-s)' }}>
                    <div style={{ marginBottom: 'var(--sp-1)' }}>
                      <Plate value={report.plate} />
                    </div>
                    <div>Пробег: {report.mileage_start} → {report.mileage_end} км</div>
                    <div>В кассе: <Money value={report.cash_on_hand} /></div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="amount">Сумма, сум</label>
            <input
              id="amount"
              className="field__input"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="1"
              placeholder="Например, 500000"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="method">Способ оплаты</label>
            <select
              id="method"
              className="field__input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              required
            >
              <option value="CASH">Наличные</option>
              <option value="TRANSFER">Перевод</option>
              <option value="CARD">Карта</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="receipt">Ссылка на чек (необязательно)</label>
            <input
              id="receipt"
              className="field__input"
              type="url"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {error && <p className="field__error">{error}</p>}
          {success && <p style={{ color: 'var(--c-ok)', fontWeight: 500 }}>{success}</p>}

          <button className="btn" type="submit" disabled={loading || !selectedReportId} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Отправка...' : 'Передать оплату'}
          </button>
        </form>
      )}
    </div>
  );
}