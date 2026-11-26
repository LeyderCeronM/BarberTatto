import { MemoryCollection, type Collection, type Entity } from '@/shared/kernel/collection';
import type { Barber, CatalogRepository, Service } from './domain';

const IMG = 'https://media.base44.com/images/public/6b0507a155abc5e7dfd2c0b1';

export const SERVICES: Service[] = [
  { id: 'corte', name: 'Corte de cabello', description: 'Tijera, máquina y acabado a navaja.', category: 'Corte', durationMin: 40, priceCOP: 22000 },
  { id: 'corte-barba', name: 'Corte + Barba', description: 'Corte y perfilado de barba en una sola sesión.', category: 'Corte', durationMin: 60, priceCOP: 30000 },
  { id: 'barba', name: 'Barba perfilada', description: 'Contorno y diseño a navaja con aceite.', category: 'Barba', durationMin: 25, priceCOP: 10000 },
  { id: 'rasurado', name: 'Rasurado de barba', description: 'Rasurado tradicional con toalla caliente.', category: 'Barba', durationMin: 15, priceCOP: 4000 },
  { id: 'cejas', name: 'Cejas', description: 'Diseño y perfilado de cejas.', category: 'Barba', durationMin: 10, priceCOP: 4000 },
  { id: 'color', name: 'Colorimetría', description: 'Color a medida para cubrir o cambiar el tono. Valor según diagnóstico.', category: 'Color', durationMin: 60, priceCOP: null },
  { id: 'ondulados', name: 'Ondulados permanentes', description: 'Permanente y textura. Valor según diagnóstico.', category: 'Color', durationMin: 90, priceCOP: null },
  { id: 'minoxidil', name: 'Tratamiento de Minoxidil', description: 'Cuidado del cuero cabelludo. Valor según diagnóstico.', category: 'Tratamiento', durationMin: 30, priceCOP: null },
];

/** Equipo inicial: solo se carga la primera vez; después lo administra el admin. */
export const SEED_BARBERS: Barber[] = [
  {
    id: 'mateo',
    name: 'Mateo Ríos',
    role: 'Fundador · Navaja y clásicos',
    bio: 'Aprendió el oficio en una barbería de barrio y lo refinó en Madrid. Corta con tijera y termina a navaja.',
    photo: `${IMG}/3970bd79be0b5bd3ee88d65c271d6c03_generated_627a0e45.png`,
  },
  {
    id: 'julian',
    name: 'Julián Vélez',
    role: 'Barbero · Fades y máquina',
    bio: 'Especialista en degradados limpios, líneas rectas y acabados que aguantan la semana.',
    photo: `${IMG}/0e4c624ce1ff6d088ca1b6eda49b7c04_generated_4810f580.png`,
  },
  {
    id: 'samuel',
    name: 'Samuel Ortiz',
    role: 'Barbero · Barba y rituales',
    bio: 'Diseña barbas según la forma del rostro y dirige el ritual de toalla caliente.',
    photo: `${IMG}/c1ed93e2f94d8b0d408a150e9e00aa80_generated_fac7b646.png`,
  },
];

export const HERO_IMAGE = `${IMG}/1e959b079604ac0dafad99bd8dce8fe0_generated_3204b4fd.png`;
export const GALLERY_IMAGES = [
  `${IMG}/81f3076e850ec402dd77c50c20fe7238_generated_ccf62eb0.png`,
  `${IMG}/ef2818838d7d967d3a469086ba9c5c11_generated_a44083c9.png`,
];

/**
 * Servicios fijos + equipo editable guardado en una colección (localStorage, memoria o base de datos).
 * El equipo inicial se siembra una sola vez; la marca en `meta` evita volver a sembrarlo si el admin
 * elimina a todos a propósito.
 */
export class CollectionCatalogRepository implements CatalogRepository {
  constructor(
    private readonly team: Collection<Barber>,
    private readonly meta: Collection<Entity>,
  ) {}

  async services() {
    return SERVICES;
  }

  /** Siembra el equipo inicial una sola vez y SIEMPRE antes de cualquier lectura o escritura. */
  private async ensureSeeded() {
    if (await this.meta.get('barbers-seeded')) return;
    await this.meta.put({ id: 'barbers-seeded' });
    if ((await this.team.all()).length === 0) for (const b of SEED_BARBERS) await this.team.put(b);
  }

  async barbers() {
    await this.ensureSeeded();
    return this.team.all();
  }

  async saveBarber(barber: Barber) {
    await this.ensureSeeded();
    await this.team.put(barber);
  }

  async deleteBarber(id: string) {
    await this.ensureSeeded();
    await this.team.remove(id);
  }
}

/** Para tests: todo en memoria. */
export class MemoryCatalogRepository extends CollectionCatalogRepository {
  constructor() {
    super(new MemoryCollection<Barber>(), new MemoryCollection<Entity>());
  }
}
