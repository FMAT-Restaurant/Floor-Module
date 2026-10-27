import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ReservasService } from './reservas.service';

export const RESERVAS_CRON_OPTIONS = Symbol('RESERVAS_CRON_OPTIONS');

export const DEFAULT_RESERVAS_CRON_INTERVAL_MS = 60_000;

export interface ReservasCronOptions {
  intervalMs?: number;
  autoStart?: boolean;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * BE-008 · Proceso programado recurrente para detectar reservas próximas dentro de la ventana
 * de anticipación (`RESERVA_PROXIMA_VENTANA_MINUTOS`, default 30 min) y emitir
 * `sala.reserva.proxima_alerta` de forma idempotente (RF-016, RN-08, RN-20).
 */
@Injectable()
export class ReservasCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservasCron.name);
  private readonly intervalMs: number;
  private readonly autoStart: boolean;

  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly reservasService: ReservasService,
    @Optional()
    @Inject(RESERVAS_CRON_OPTIONS)
    options?: ReservasCronOptions,
  ) {
    this.intervalMs =
      options?.intervalMs ??
      parsePositiveInt(process.env.RESERVAS_CRON_INTERVAL_MS, DEFAULT_RESERVAS_CRON_INTERVAL_MS);
    this.autoStart =
      options?.autoStart ??
      (process.env.NODE_ENV === 'test'
        ? process.env.RESERVAS_CRON_ENABLED === 'true'
        : process.env.RESERVAS_CRON_ENABLED !== 'false');
  }

  onModuleInit(): void {
    if (this.autoStart) {
      this.startPolling();
    }
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  /**
   * Inicia el ciclo periódico de evaluación de reservas próximas.
   */
  startPolling(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.checkReservasProximas();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  /**
   * Detiene el ciclo periódico de evaluación de reservas próximas.
   */
  stopPolling(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Indica si el proceso se encuentra ejecutando una evaluación en este momento.
   */
  isBusy(): boolean {
    return this.isProcessing;
  }

  /**
   * Evalúa las reservas próximas dentro de la ventana configurada y emite alertas pendientes.
   * Evita ejecuciones superpuestas mediante el bloqueo en memoria `isProcessing`.
   *
   * @returns Cantidad de alertas emitidas en este ciclo.
   */
  async checkReservasProximas(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;

    try {
      return await this.reservasService.procesarAlertasProximas();
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          msg: 'Error al detectar reservas próximas en proceso programado',
          error: mensaje,
        }),
      );
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
