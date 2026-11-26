import { useState } from 'react';

/** Estrellas de solo lectura; admite valores fraccionarios (4.6 llena 92 % de la fila). */
export function Stars({ value, size = '1em' }: { value: number; size?: string }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

/** Selector de 1 a 5 estrellas. */
export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="star-input" role="radiogroup" aria-label="Calificación" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          className={n <= shown ? 'on' : ''}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
