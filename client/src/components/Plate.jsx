export default function Plate({ value, large = false }) {
  if (!value) return null;
  
  // Разделяем номер на часть для полосы (первые 2 символа, например "UZ" или "01") и основную часть
  // В спецификации показан пример "UZ 01 A 123 BC". 
  // Для простоты берём первые 2 символа как код региона/страны, остальное как номер.
  const strip = value.slice(0, 2).toUpperCase();
  const text = value.slice(2).trim().toUpperCase();

  return (
    <span className={`plate ${large ? 'plate--l' : ''}`}>
      <span className="plate__strip">{strip}</span>
      <span className="plate__text">{text}</span>
    </span>
  );
}