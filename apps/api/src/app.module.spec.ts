import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { EstadoMesa, EVENT_TOPICS } from '@floor/shared';

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
});
