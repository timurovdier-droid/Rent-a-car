export default function Money({ value }) {
  if (value === null || value === undefined || value === '') return <span>—</span>;
  const formatted = new Intl.NumberFormat('ru-RU').format(Number(value));
  return <span>{formatted} сум</span>;
}
