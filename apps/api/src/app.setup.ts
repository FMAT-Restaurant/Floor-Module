import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** SPEC §1: base path `/sala`. */
export const PREFIJO_GLOBAL = 'sala';

/** SPEC §1: tamaño máximo de request 64 KB → 413. */
export const LIMITE_CUERPO_JSON = '64kb';

/**
 * Configuración común de la aplicación. La usan main.ts y las pruebas de integración HTTP,
 * así que ambos arrancan con el mismo prefijo, límite de cuerpo y filtro de errores.
 * Requiere crear la app con `{ bodyParser: false }`.
 */
export function configurarApp(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: LIMITE_CUERPO_JSON });
  app.setGlobalPrefix(PREFIJO_GLOBAL);
  app.useGlobalFilters(new AllExceptionsFilter());
}
