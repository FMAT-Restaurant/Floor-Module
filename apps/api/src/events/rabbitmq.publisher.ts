import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import type { EventEnvelope } from '@floor/shared';
import type { OutboxPublishableEvent } from './outbox.types';

export const RABBITMQ_PUBLISHER_OPTIONS = Symbol('RABBITMQ_PUBLISHER_OPTIONS');

export const DEFAULT_RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
export const DEFAULT_RABBITMQ_EXCHANGE = 'sala.events';
export const EXCHANGE_TYPE_TOPIC = 'topic';

export interface RabbitMqPublisherOptions {
  url?: string;
  exchange?: string;
  autoConnect?: boolean;
  connectFn?: typeof amqp.connect;
}

/**
 * BE-004 · Conector y publicador AMQP hacia RabbitMQ (SPEC.md §6.1, ADR-003, ADR-006).
 * Gestiona conexión resiliente a exchange `topic` durable y publica eventos con las cabeceras
 * obligatorias de trazabilidad y deduplicación (`x-event-id`, `x-correlation-id`).
 */
@Injectable()
export class RabbitMqPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqPublisher.name);
  private readonly url: string;
  private readonly exchange: string;
  private readonly autoConnect: boolean;
  private readonly connectFn: typeof amqp.connect;

  private connection: amqp.AmqpConnection | null = null;
  private channel: amqp.AmqpChannel | null = null;
  private connectingPromise: Promise<amqp.AmqpChannel> | null = null;

  constructor(
    @Optional()
    @Inject(RABBITMQ_PUBLISHER_OPTIONS)
    options?: RabbitMqPublisherOptions,
  ) {
    this.url = options?.url ?? process.env.RABBITMQ_URL ?? DEFAULT_RABBITMQ_URL;
    this.exchange = options?.exchange ?? process.env.RABBITMQ_EXCHANGE ?? DEFAULT_RABBITMQ_EXCHANGE;
    this.autoConnect =
      options?.autoConnect ??
      (process.env.NODE_ENV === 'test'
        ? process.env.RABBITMQ_AUTO_CONNECT === 'true'
        : process.env.RABBITMQ_AUTO_CONNECT !== 'false');
    this.connectFn = options?.connectFn ?? amqp.connect;
  }

  async onModuleInit(): Promise<void> {
    if (!this.autoConnect) {
      return;
    }
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Indica si el canal AMQP se encuentra activo (para health checks como BE-011 `/health`).
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  getExchange(): string {
    return this.exchange;
  }

  /**
   * Intenta establecer conexión y canal de forma resiliente (sin lanzar excepción si el broker
   * no está disponible al arrancar la aplicación).
   */
  async connect(): Promise<boolean> {
    try {
      await this.ensureChannel();
      return true;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          msg: 'No fue posible conectar con RabbitMQ; se reintentará al publicar eventos',
          exchange: this.exchange,
          error: mensaje,
        }),
      );
      return false;
    }
  }

  /**
   * Cierra limpiamente el canal y la conexión AMQP.
   */
  async disconnect(): Promise<void> {
    const currentChannel = this.channel;
    const currentConnection = this.connection;
    this.channel = null;
    this.connection = null;
    this.connectingPromise = null;

    if (currentChannel !== null) {
      try {
        await currentChannel.close();
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Error al cerrar canal AMQP: ${mensaje}`);
      }
    }

    if (currentConnection !== null) {
      try {
        await currentConnection.close();
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Error al cerrar conexión AMQP: ${mensaje}`);
      }
    }
  }

  /**
   * Publica un evento del Outbox en el exchange `topic` con las cabeceras obligatorias de SPEC §6.1:
   * - `x-event-id`: UUID v4 único del registro Outbox
   * - `x-correlation-id`: ID de trazabilidad
   * - `content-type`: `'application/json'`
   * - `delivery-mode`: `2` (persistente)
   */
  async publish(event: OutboxPublishableEvent): Promise<void> {
    const channel = await this.ensureChannel();
    const correlationId =
      event.correlationId && event.correlationId.trim().length > 0
        ? event.correlationId.trim()
        : randomUUID();

    const envelope: EventEnvelope<unknown> = {
      eventId: event.id,
      eventType: event.routingKey,
      timestamp: new Date().toISOString(),
      correlationId,
      data: event.payload,
    };
    const buffer = Buffer.from(JSON.stringify(envelope), 'utf-8');

    const accepted = channel.publish(this.exchange, event.routingKey, buffer, {
      contentType: 'application/json',
      deliveryMode: 2,
      persistent: true,
      messageId: event.id,
      correlationId,
      headers: {
        'x-event-id': event.id,
        'x-correlation-id': correlationId,
      },
    });

    if (!accepted) {
      throw new Error(
        `El canal de RabbitMQ rechazó la publicación por saturación de buffer (eventId=${event.id})`,
      );
    }
  }

  private async ensureChannel(): Promise<amqp.AmqpChannel> {
    if (this.channel !== null) {
      return this.channel;
    }

    const enCurso = this.connectingPromise;
    if (enCurso !== null) {
      return enCurso;
    }

    const nuevaPromesa = this.establishChannel();
    this.connectingPromise = nuevaPromesa;
    try {
      return await nuevaPromesa;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async establishChannel(): Promise<amqp.AmqpChannel> {
    const connection = await this.connectFn(this.url, { timeout: 3000 });
    connection.on('error', (err: Error) => {
      this.logger.error(
        JSON.stringify({
          msg: 'Error en conexión AMQP de RabbitMQ',
          error: err.message,
        }),
      );
      this.channel = null;
      this.connection = null;
    });
    connection.on('close', () => {
      this.channel = null;
      this.connection = null;
    });

    const channel = await connection.createChannel();
    channel.on('error', (err: Error) => {
      this.logger.error(
        JSON.stringify({
          msg: 'Error en canal AMQP de RabbitMQ',
          error: err.message,
        }),
      );
      this.channel = null;
    });
    channel.on('close', () => {
      this.channel = null;
    });

    await channel.assertExchange(this.exchange, EXCHANGE_TYPE_TOPIC, { durable: true });

    this.connection = connection;
    this.channel = channel;
    return channel;
  }
}
