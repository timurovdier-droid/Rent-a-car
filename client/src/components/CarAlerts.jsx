import { fmtMoney } from '../labels';

export function alertWeight(car) {
  return (car.pending_count ? 4 : 0)
    + (car.service_due === 'OVERDUE' ? 3 : car.service_due ? 1 : 0)
    + (car.insurance_due || car.inspection_due ? 2 : 0);
}

export function CarAlertBadges({ car }) {
  if (!alertWeight(car)) return null;
  return (
    <div className="badges">
      {car.pending_count > 0 && (
        <span className="badge badge--wait">Ждёт подтверждения · {fmtMoney(car.pending_amount)}</span>
      )}
      {car.service_due && (
        <span className={`badge ${car.service_due === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>
          {car.service_due === 'OVERDUE' ? 'Пора на обслуживание' : 'Скоро ТО'}
        </span>
      )}
      {car.insurance_due && (
        <span className={`badge ${car.insurance_due === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>Страховка</span>
      )}
      {car.inspection_due && (
        <span className={`badge ${car.inspection_due === 'OVERDUE' ? 'badge--danger' : 'badge--warn'}`}>Техосмотр</span>
      )}
    </div>
  );
}
