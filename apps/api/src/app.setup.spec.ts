import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { configurarApp, LIMITE_CUERPO_JSON, PREFIJO_GLOBAL } from './app.setup';

describe('configurarApp (INT-001, SPEC §1)', () => {
  it('configura límite de cuerpo, prefijo global excluyendo /health y filtro de excepciones', () => {
    const appMock = {
      useBodyParser: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalFilters: jest.fn(),
    } as unknown as jest.Mocked<NestExpressApplication>;

    configurarApp(appMock);

    expect(appMock.useBodyParser).toHaveBeenCalledWith('json', {
      limit: LIMITE_CUERPO_JSON,
    });
    expect(appMock.setGlobalPrefix).toHaveBeenCalledWith(PREFIJO_GLOBAL, {
      exclude: ['health'],
    });
    expect(appMock.useGlobalFilters).toHaveBeenCalledWith(expect.any(AllExceptionsFilter));
  });

  it('exporta el prefijo global con fallback a api/v1/floor si GLOBAL_PREFIX no está definido', () => {
    expect(PREFIJO_GLOBAL).toBe(process.env.GLOBAL_PREFIX || 'api/v1/floor');
  });
});
