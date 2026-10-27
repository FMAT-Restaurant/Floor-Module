import { Logger } from '@nestjs/common';
import { DEFAULT_RESERVAS_CRON_INTERVAL_MS, ReservasCron } from './reservas.cron';
import type { ReservasService } from './reservas.service';

describe('ReservasCron (BE-008 · RF-016 · RN-20)', () => {
  let reservasService: jest.Mocked<Pick<ReservasService, 'procesarAlertasProximas'>>;

  beforeEach(() => {
    jest.useFakeTimers();
    reservasService = {
      procesarAlertasProximas: jest.fn().mockResolvedValue(0),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.RESERVAS_CRON_INTERVAL_MS;
    delete process.env.RESERVAS_CRON_ENABLED;
  });

  it('ejecuta procesarAlertasProximas periódicamente al avanzar el reloj y se detiene en onModuleDestroy', async () => {
    reservasService.procesarAlertasProximas.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const cron = new ReservasCron(reservasService as unknown as ReservasService, {
      intervalMs: DEFAULT_RESERVAS_CRON_INTERVAL_MS,
      autoStart: true,
    });

    cron.onModuleInit();
    // Llamar startPolling de nuevo es idempotente si ya está activo
    cron.startPolling();

    jest.advanceTimersByTime(DEFAULT_RESERVAS_CRON_INTERVAL_MS);
    await Promise.resolve();
    expect(reservasService.procesarAlertasProximas).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(DEFAULT_RESERVAS_CRON_INTERVAL_MS);
    await Promise.resolve();
    expect(reservasService.procesarAlertasProximas).toHaveBeenCalledTimes(2);

    cron.onModuleDestroy();
    jest.advanceTimersByTime(DEFAULT_RESERVAS_CRON_INTERVAL_MS * 3);
    expect(reservasService.procesarAlertasProximas).toHaveBeenCalledTimes(2);
  });

  it('no inicia el timer en entorno test por defecto salvo que autoStart o RESERVAS_CRON_ENABLED sea true', () => {
    const cronInactivo = new ReservasCron(reservasService as unknown as ReservasService);
    cronInactivo.onModuleInit();

    jest.advanceTimersByTime(DEFAULT_RESERVAS_CRON_INTERVAL_MS * 2);
    expect(reservasService.procesarAlertasProximas).not.toHaveBeenCalled();

    process.env.RESERVAS_CRON_INTERVAL_MS = '5000';
    process.env.RESERVAS_CRON_ENABLED = 'true';
    const cronActivoPorEnv = new ReservasCron(reservasService as unknown as ReservasService);
    cronActivoPorEnv.onModuleInit();

    jest.advanceTimersByTime(5000);
    expect(reservasService.procesarAlertasProximas).toHaveBeenCalledTimes(1);
    cronActivoPorEnv.onModuleDestroy();
  });

  it('evita ejecuciones superpuestas mientras isBusy() es true', async () => {
    let resolverPrimera!: (valor: number) => void;
    reservasService.procesarAlertasProximas.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolverPrimera = resolve;
        }),
    );

    const cron = new ReservasCron(reservasService as unknown as ReservasService, {
      autoStart: false,
    });

    const primeraEjecucion = cron.checkReservasProximas();
    expect(cron.isBusy()).toBe(true);

    // Segunda llamada concurrente retorna 0 sin volver a invocar el servicio
    const segundaConcurrente = await cron.checkReservasProximas();
    expect(segundaConcurrente).toBe(0);
    expect(reservasService.procesarAlertasProximas).toHaveBeenCalledTimes(1);

    resolverPrimera(1);
    await expect(primeraEjecucion).resolves.toBe(1);
    expect(cron.isBusy()).toBe(false);
  });

  it('captura y registra errores del servicio sin propagar excepciones no manejadas', async () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    reservasService.procesarAlertasProximas
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockRejectedValueOnce('error texto');

    const cron = new ReservasCron(reservasService as unknown as ReservasService, {
      autoStart: false,
    });

    await expect(cron.checkReservasProximas()).resolves.toBe(0);
    await expect(cron.checkReservasProximas()).resolves.toBe(0);
    expect(cron.isBusy()).toBe(false);
    expect(loggerSpy).toHaveBeenCalledTimes(2);
    expect(loggerSpy.mock.calls[0]?.[0]).toContain('DB timeout');
  });
});
