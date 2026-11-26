import { Link } from 'react-router-dom';
import { RatingBadge, Stars } from '@/modules/reviews/ui';
import { GALLERY_IMAGES, HERO_IMAGE } from '@/modules/catalog';
import { container } from '@/app/container';
import { useLiveQuery } from '@/shared/hooks';
import { config } from '@/shared/config';
import { formatCOP } from '@/shared/kernel/time';

export function Landing() {
  const services = useLiveQuery(() => container.catalog.services(), []);
  const barbers = useLiveQuery(() => container.catalog.barbers(), []);
  const categories = [...new Set(services?.map((s) => s.category))];

  return (
    <>
      <header className="nav">
        <span className="logo">BARBER TATTOO</span>
        <nav>
          <a href="#servicios">Servicios</a>
          <a href="#artesanos">Artesanos</a>
          <a href="#local">Local</a>
        </nav>
        <div className="row">
          <Link className="btn ghost small" to="/cuenta">
            Mi cuenta
          </Link>
          <Link className="btn small" to="/reservar">
            Reservar
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Barbería · Popayán · Est. 2014</p>
          <h1 className="display">
            Corte
            <br />
            sobre
            <br />
            <em>medida</em>
          </h1>
          <div className="about">
            <h2 className="eyebrow gold">Sobre nosotros</h2>
            <p className="lead">{config.about}</p>
            <p className="location">
              <span aria-hidden="true">📍</span> {config.address}{' '}
              <a href={config.mapsUrl} target="_blank" rel="noreferrer">
                Cómo llegar →
              </a>
            </p>
            <RatingBadge />
          </div>
          <div className="row">
            <Link className="btn" to="/reservar">
              Reservar cita →
            </Link>
            <a className="btn ghost" href="#servicios">
              Ver servicios
            </a>
          </div>
        </div>
        <div className="hero-img" style={{ backgroundImage: `url(${HERO_IMAGE})` }} role="img" aria-label="Retrato de cliente con degradado y barba" />
      </section>

      <section id="servicios" className="section">
        <p className="eyebrow">01 — Servicios</p>
        <h2 className="display h2">Cada servicio tiene su propio tiempo.</h2>
        {categories.map((cat) => (
          <div key={cat} className="svc-group">
            <h3 className="eyebrow gold">{cat}</h3>
            {services?.filter((s) => s.category === cat).map((s) => (
              <div key={s.id} className="svc">
                <div>
                  <strong>{s.name}</strong>
                  <p className="muted">{s.description}</p>
                </div>
                <span className="mono muted">{s.durationMin} MIN</span>
                <span className="mono">{formatCOP(s.priceCOP)}</span>
              </div>
            ))}
          </div>
        ))}
        <p className="mono muted small-text">Precios en pesos colombianos · Pago en efectivo, directamente con el barbero</p>
      </section>

      <section id="artesanos" className="section">
        <p className="eyebrow">02 — Artesanos</p>
        <h2 className="display h2">Manos que ya saben dónde cortar.</h2>
        <div className="grid3">
          {barbers?.map((b, i) => (
            <article key={b.id} className="card">
              {b.photo && <img src={b.photo} alt={b.name} className="avatar" loading="lazy" />}
              <span className="mono muted">0{i + 1}</span>
              <h3>{b.name}</h3>
              <p className="eyebrow gold">{b.role}</p>
              <p className="muted">{b.bio}</p>
            </article>
          ))}
        </div>
        <div className="gallery">
          {GALLERY_IMAGES.map((src) => (
            <img key={src} src={src} alt="" loading="lazy" />
          ))}
        </div>
      </section>

      <section id="local" className="section split">
        <div>
          <p className="eyebrow">03 — El local</p>
          <h2 className="display h2">Barber Tattoo Club, en Popayán.</h2>
          <p className="muted">{config.address}</p>
          <p className="muted">Trabajamos con agenda cerrada para no hacer esperar a nadie. Reserva en línea y llega cinco minutos antes.</p>
        </div>
        <dl className="hours">
          <dt>Lunes a viernes</dt>
          <dd className="mono">9:00 — 20:00</dd>
          <dt>Sábado</dt>
          <dd className="mono">9:00 — 18:00</dd>
          <dt>Domingo y festivos</dt>
          <dd className="mono">Cerrado</dd>
        </dl>
      </section>

      <Opinions />

      <section className="cta">
        <h2 className="display">Reserva tu ritual.</h2>
        <Link className="btn" to="/reservar">
          Elegir día y hora
        </Link>
      </section>

      <footer className="footer mono muted">
        © {new Date().getFullYear()} Barber Tattoo ·{' '}
        <Link to="/barbero" className="muted">
          Barberos
        </Link>{' '}
        ·{' '}
        <Link to="/admin" className="muted">
          Admin
        </Link>
      </footer>
    </>
  );
}

function Opinions() {
  const reviews = useLiveQuery(() => container.reviews.listPublic(), []);
  const withText = reviews?.filter((r) => r.comment).slice(0, 6);
  return (
    <section id="opiniones" className="section">
      <p className="eyebrow">04 — Opiniones</p>
      <h2 className="display h2">Lo que dicen después del espejo.</h2>
      {withText?.length ? (
        <div className="grid3">
          {withText.map((r) => (
            <figure key={r.createdAt} className="card quote">
              <Stars value={r.rating} />
              <blockquote>“{r.comment}”</blockquote>
              <figcaption className="mono muted">{r.firstName.toUpperCase()} · CLIENTE ATENDIDO</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted">Todavía no hay comentarios de clientes.</p>
      )}
      <p className="mono muted small-text">Solo califican clientes que ya fueron atendidos.</p>
    </section>
  );
}
