import { Link, Route, Routes } from 'react-router-dom';
import { Landing } from '@/modules/landing/Landing';
import { BookingWizard } from '@/modules/booking/ui/BookingWizard';
import { AppointmentPage } from '@/modules/booking/ui/AppointmentPage';
import { OfferPage } from '@/modules/booking/ui/OfferPage';
import { RatePage } from '@/modules/reviews/ui';
import { AccountPage } from '@/modules/customers/ui/AccountPage';
import { AdminPage } from '@/modules/admin/AdminPage';
import { BarberPage } from '@/modules/admin/BarberPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/reservar" element={<BookingWizard />} />
      <Route path="/cita/:token" element={<AppointmentPage />} />
      <Route path="/oferta/:token" element={<OfferPage />} />
      <Route path="/calificar/:token" element={<RatePage />} />
      <Route path="/cuenta" element={<AccountPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/barbero" element={<BarberPage />} />
      <Route
        path="*"
        element={
          <main className="page narrow center">
            <h1 className="display">404</h1>
            <p className="muted">Esta página no existe.</p>
            <Link className="btn" to="/">
              Volver al inicio
            </Link>
          </main>
        }
      />
    </Routes>
  );
}
