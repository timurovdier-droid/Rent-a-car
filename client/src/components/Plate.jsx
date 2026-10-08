function splitPlate(value) {
  const raw = String(value).toUpperCase().replace(/[\s-]+/g, '');
  const m = /^(\d{2})(.*)$/.exec(raw);
  const region = m ? m[1] : '';
  const rest = m ? m[2] : raw;
  const groups = rest.match(/[A-Z]+|\d+|[^A-Z\d]+/g) || [rest];
  return { region, number: groups.join(' ') };
}

export default function Plate({ value, large = false }) {
  if (!value) return null;
  const { region, number } = splitPlate(value);

  return (
    <span className={`plate ${large ? 'plate--l' : ''}`} aria-label={`Госномер ${region} ${number}`}>
      {region && <span className="plate__region">{region}</span>}
      <span className="plate__text">{number}</span>
      <span className="plate__flag" aria-hidden="true">
        <i className="plate__stripe plate__stripe--blue" />
        <i className="plate__stripe plate__stripe--green" />
        <b>UZ</b>
      </span>
    </span>
  );
}
