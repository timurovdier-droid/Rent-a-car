export default function StatusMark({ status }) {
  const map = {
    'ACTIVE': { label: 'Активен', className: 'status--done' },
    'FREE': { label: 'Свободен', className: 'status--done' },
    'RENTED': { label: 'В аренде', className: 'status--wait' },
    'SERVICE': { label: 'На обслуживании', className: 'status--wait' },
    'ARCHIVED': { label: 'Архив', className: 'status--bad' },
    'LOCKED': { label: 'Заблокирован', className: 'status--bad' },
    'DISPATCHER_PENDING': { label: 'Ждёт диспетчера', className: 'status--wait' },
    'ADMIN_PENDING': { label: 'Ждёт админа', className: 'status--wait' },
    'ADMIN_CONFIRMED': { label: 'Подтверждён', className: 'status--done' },
    'REJECTED': { label: 'Отклонён', className: 'status--bad' },
    'SCHEDULED': { label: 'Запланировано', className: 'status--wait' },
    'COMPLETED': { label: 'Завершено', className: 'status--done' },
  };

  const config = map[status] || { label: status, className: '' };

  return (
    <span className={`status ${config.className}`}>
      <span className="status__mark" />
      {config.label}
    </span>
  );
}