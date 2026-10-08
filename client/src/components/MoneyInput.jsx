import { fmtMoney } from '../labels';

// Поле суммы: показывает «500 000», отдаёт строку только из цифр.
export default function MoneyInput({ value, onChange, id, placeholder = '0', required, autoFocus, suffix = 'сум' }) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return (
    <div className="money-input">
      <input
        id={id}
        className="field__input money-input__field"
        inputMode="numeric"
        autoComplete="off"
        value={digits ? fmtMoney(digits) : ''}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
      />
      {suffix && <span className="money-input__suffix">{suffix}</span>}
    </div>
  );
}
