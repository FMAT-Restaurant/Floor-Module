import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { EstadoMesa, EVENT_TOPICS, crearMesaSchema, openApiSpec } from '@floor/shared';

describe('AppModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  it('should compile the application module', () => {
    expect(module).toBeDefined();
    const appModule = module.get<AppModule>(AppModule);
    expect(appModule).toBeInstanceOf(AppModule);
  });

  it('should resolve shared contracts within API testing context', () => {
    expect(EstadoMesa.LIBRE).toBe('Libre');
    expect(EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO).toBe('sala.mesa.estado_actualizado');
  });

  it('should resolve and execute shared Zod schemas and OpenAPI spec in API runtime', () => {
    const parseResult = crearMesaSchema.safeParse({
      numeroMesa: 1,
      capacidad: 4,
      zona: 'Interior',
    });
    expect(parseResult.success).toBe(true);
    expect(openApiSpec.openapi).toBe('3.0.3');
  });
});
