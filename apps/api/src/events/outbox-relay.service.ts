import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { OutboxEvento } from '@prisma/client';
import { Reloj } from '../common/reloj/reloj';
import { PrismaService } from '../prisma/prisma.service';
import type { OutboxPublishedListener } from './outbox.types';
import { RabbitMqPublisher } from './rabbitmq.publisher';

export const OUTBOX_RELAY_OPTIONS = Symbol('OUTBOX_RELAY_OPTIONS');

export const DEFAULT_OUTBOX_BATCH_SIZE = 50;
export const DEFAULT_OUTBOX_MAX_INTENTOS = 10;
export const DEFAULT_OUTBOX_POLL_INTERVAL_MS = 1000;

export interface OutboxRelayOptions {
  batchSize?: number;
  maxIntentos?: number;
  pollIntervalMs?: number;
  autoStart?: boolean;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * BE-004 · Proceso Relay en segundo plano para el patrón Outbox (RF-008, RNF-005, ADR-006).
 * Lee en lotes eventos pendientes de `outbox_evento`, los publica en RabbitMQ y gestiona
 * confirmaciones (`publicadoEn`) o reintentos (`intentos + 1`) garantizando entrega at-least-once.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly batchSize: number;
  private readonly maxIntentos: number;
  private readonly pollIntervalMs: number;
  private readonly autoStart: boolean;
  private readonly reloj: Reloj;

  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<OutboxPublishedListener>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RabbitMqPublisher,
    @Optional() reloj?: Reloj,
    @Optional()
    @Inject(OUTBOX_RELAY_OPTIONS)
    options?: OutboxRelayOptions,
  ) {
    this.reloj = reloj ?? new Reloj();
    this.batchSize =
      options?.batchSize ??
      parsePositiveInt(process.env.OUTBOX_BATCH_SIZE, DEFAULT_OUTBOX_BATCH_SIZE);
    this.maxIntentos =
      options?.maxIntentos ??
      parsePositiveInt(process.env.OUTBOX_MAX_INTENTOS, DEFAULT_OUTBOX_MAX_INTENTOS);
    this.pollIntervalMs =
      options?.pollIntervalMs ??
      parsePositiveInt(process.env.OUTBOX_POLL_INTERVAL_MS, DEFAULT_OUTBOX_POLL_INTERVAL_MS);
    this.autoStart =
      options?.autoStart ??
      (process.env.NODE_ENV === 'test'
        ? process.env.OUTBOX_POLL_ENABLED === 'true'
        : process.env.OUTBOX_POLL_ENABLED !== 'false');
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
   * Inicia el ciclo periódico de consulta y publicación de eventos pendientes.
   */
  startPolling(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.processPendingEvents();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  /**
   * Detiene el ciclo periódico de consulta de eventos pendientes.
   */
  stopPolling(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Indica si el relay se encuentra procesando un lote en este momento.
   */
  isBusy(): boolean {
    return this.isProcessing;
  }

  /**
   * Registra un listener local post-publicación (preparación para BE-005 `SalaWebSocketGateway`).
   * Devuelve una función para cancelar la suscripción.
   */
  registerListener(listener: OutboxPublishedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Procesa un lote de eventos pendientes (`publicadoEn IS NULL` e `intentos < maxIntentos`)
   * ordenados por `creadoEn ASC`.
   * Evita ejecuciones superpuestas mediante el bloqueo en memoria `isProcessing`.
   *
   * @returns Cantidad de eventos publicados exitosamente en este ciclo.
   */
  async processPendingEvents(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;

    try {
      const pendientes = await this.prisma.outboxEvento.findMany({
        where: {
          publicadoEn: null,
          intentos: { lt: this.maxIntentos },
        },
        orderBy: { creadoEn: 'asc' },
        take: this.batchSize,
      });

      return await this.procesarLoteSecuencial(pendientes);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          msg: 'Error al consultar lote de eventos pendientes en outbox_evento',
          error: mensaje,
        }),
      );
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  private async procesarLoteSecuencial(
    pendientes: readonly OutboxEvento[],
    indice = 0,
  ): Promise<number> {
    if (indice >= pendientes.length) {
      return 0;
    }
    const exito = await this.procesarEventoIndividual(pendientes[indice]);
    const resto = await this.procesarLoteSecuencial(pendientes, indice + 1);
    return (exito ? 1 : 0) + resto;
  }

  private async procesarEventoIndividual(evento: OutboxEvento): Promise<boolean> {
    try {
      await this.publisher.publish({
        id: evento.id,
        routingKey: evento.routingKey,
        payload: evento.payload,
        correlationId: evento.correlationId,
      });

      const publicadoEn = this.reloj.ahora();
      const actualizado = await this.prisma.outboxEvento.update({
        where: { id: evento.id },
        data: { publicadoEn },
      });

      await this.notificarListeners(actualizado);
      return true;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          msg: 'Fallo al publicar evento de Outbox en RabbitMQ; se incrementará intentos',
          eventId: evento.id,
          routingKey: evento.routingKey,
          correlationId: evento.correlationId,
          intentosPrevios: evento.intentos,
          error: mensaje,
        }),
      );

      if (evento.intentos === 0) {
        await this.notificarListeners(evento);
      }

      try {
        await this.prisma.outboxEvento.update({
          where: { id: evento.id },
          data: {
            intentos: { increment: 1 },
          },
        });
      } catch (updateError) {
        const updateMsg = updateError instanceof Error ? updateError.message : String(updateError);
        this.logger.error(
          JSON.stringify({
            msg: 'Error adicional al incrementar intentos en outbox_evento',
            eventId: evento.id,
            error: updateMsg,
          }),
        );
      }

      return false;
    }
  }

  private async notificarListeners(evento: OutboxEvento): Promise<void> {
    await Promise.all(
      Array.from(this.listeners, (listener) => this.invocarListenerSeguro(listener, evento)),
    );
  }

  private async invocarListenerSeguro(
    listener: OutboxPublishedListener,
    evento: OutboxEvento,
  ): Promise<void> {
    try {
      await listener(evento);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          msg: 'Error en listener local post-publicación de Outbox',
          eventId: evento.id,
          routingKey: evento.routingKey,
          error: mensaje,
        }),
      );
    }
  }
}
