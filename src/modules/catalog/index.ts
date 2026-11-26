// API pública del módulo catalog. Los demás módulos importan solo desde aquí.
export type { Service, Barber, NewBarber, ServiceCategory, CatalogRepository } from './domain';
export { CatalogService } from './catalogService';
export { CollectionCatalogRepository, MemoryCatalogRepository, SEED_BARBERS, SERVICES, GALLERY_IMAGES, HERO_IMAGE } from './seed';
