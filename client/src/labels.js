export const KIND_LABELS = { INCOME: 'Доход', EXPENSE: 'Расход' };

export const INCOME_CATEGORIES = [
  ['RENT', 'Аренда'],
  ['DEPOSIT', 'Депозит'],
  ['OTHER_INCOME', 'Другой доход'],
];

export const EXPENSE_CATEGORIES = [
  ['FUEL', 'Бензин / газ'],
  ['REPAIR', 'Ремонт и запчасти'],
  ['SERVICE', 'ТО'],
  ['FINES', 'Штрафы'],
  ['WASH', 'Мойка'],
  ['INSURANCE', 'Страховка / документы'],
  ['OTHER', 'Другое'],
];

export const CATEGORY_LABELS = Object.fromEntries([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]);

export const PAY_METHODS = [
  ['CASH', 'Наличные'],
  ['CARD', 'Карта'],
  ['BALANCE', 'Баланс'],
];

// Старые способы больше не предлагаются, но остаются в истории операций.
const LEGACY_METHODS = [
  ['TRANSFER', 'Перевод'],
  ['CLICK', 'Click'],
  ['PAYME', 'Payme'],
  ['UZUM', 'Uzum'],
];

export const METHOD_LABELS = Object.fromEntries([...PAY_METHODS, ...LEGACY_METHODS, ['DEPOSIT', 'Из депозита']]);

export const CHARGE_KINDS = [
  ['REPAIR', 'Ремонт'],
  ['DAMAGE', 'Повреждение / ДТП'],
  ['FINE', 'Штраф'],
  ['OTHER', 'Другое'],
];

export const CHARGE_LABELS = Object.fromEntries(CHARGE_KINDS);

export const FUEL_TYPES = [
  ['PETROL', 'Бензин'],
  ['PROPANE', 'Пропан'],
  ['METHANE', 'Метан'],
  ['GAS', 'Газ'],
  ['DIESEL', 'Дизель'],
  ['HYBRID', 'Гибрид'],
  ['ELECTRIC', 'Электро'],
];

export const FUEL_LABELS = Object.fromEntries(FUEL_TYPES);

export const SERVICE_TYPES = [
  ['OIL_CHANGE', 'Замена масла'],
  ['REPAIR', 'Ремонт'],
  ['INSPECTION', 'Техосмотр'],
  ['INSURANCE', 'Страховка'],
  ['TIRE', 'Шины'],
  ['OTHER', 'Другое'],
];

const TZ = 'Asia/Tashkent';

export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function shiftDay(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function fmtMoney(value) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0));
}

export function fmtNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('ru-RU').format(Number(value));
}

export function fmtDay(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function parseUtc(value) {
  const text = String(value);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
}

export function fmtDateTime(value) {
  if (!value) return '—';
  return parseUtc(value).toLocaleString('ru-RU', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Местная дата (Ташкент) для отметки времени из базы.
export function localDayOf(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(parseUtc(value));
}

export function shortDay(day) {
  const [, m, d] = day.split('-');
  return `${d}.${m}`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter((w) => /^[\p{L}]/u.test(w)).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
}

export function downloadCsv(filename, header, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(escape).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
