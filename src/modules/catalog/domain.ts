export type ServiceCategory = 'Corte' | 'Barba' | 'Color' | 'Tratamiento';

export interface Service {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  durationMin: number;
  /** null = "Consultar" (valor según diagnóstico) */
  priceCOP: number | null;
}

export interface Barber {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo?: string;
}

export type NewBarber = Omit<Barber, 'id'>;

/** Puerto: servicios de solo lectura por ahora; el equipo es editable por el admin. */
export interface CatalogRepository {
  services(): Promise<Service[]>;
  barbers(): Promise<Barber[]>;
  saveBarber(barber: Barber): Promise<void>;
  deleteBarber(id: string): Promise<void>;
}
