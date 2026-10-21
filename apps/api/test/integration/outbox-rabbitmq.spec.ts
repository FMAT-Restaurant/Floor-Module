import * as amqp from 'amqplib';
import { Test, type TestingModule } from '@nestjs/testing';
import { EstadoMesa as EstadoMesaPrisma } from '@prisma/client';
import {
  EstadoMesa,
  EVENT_TOPICS,
  type DiningSessionIniciadaPayload,
  type MesaEstadoActualizadoPayload,
} from '@floor/shared';
import { AppModule } from '../../src/app.module';
import { OutboxRelayService, OutboxService, RabbitMqPublisher } from '../../src/events';
import { MesaEstadoService } from '../../src/modules/mesas/mesa-estado.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * BE-004 · Pruebas de integración del patrón Outbox transaccional y publicador RabbitMQ
 * (RF-008, RNF-004, RNF-005, SPEC §6.1, ADR-003, ADR-006).
 */
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const TEST_EXCHANGE = 'sala.events.integration.test';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440099';
const MESERO_ID = 'd1000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'c1000000-0000-4000-8000-000000000077';

/**
 * Broker AMQP en memoria de respaldo para entornos de CI donde `.github/workflows/ci.yml`
 * sólo levanta el contenedor de PostgreSQL 16 sin servicio RabbitMQ.
 * Cuando RabbitMQ está activo localmente (Docker Compose), la prueba usa el broker AMQP real.
 */
function crearLoopbackAmqpConnect(): typeof amqp.connect {
  const consumers = new Map<string, (msg: amqp.AmqpConsumeMessage | null) => void>();
  const bindings: Array<{ exchange: string; pattern: string; queue: string }> = [];
  let queueSeq = 0;

  function coincideTopic(pattern: string, routingKey: string): boolean {
    if (pattern === '#' || pattern === routingKey) return true;
    if (pattern.endsWith('.#')) {
      const prefix = pattern.slice(0, -2);
      return routingKey === prefix || routingKey.startsWith(`${prefix}.`);
    }
    return false;
  }

  return async (): Promise<amqp.AmqpConnection> => {
    const channel: amqp.AmqpChannel = {
      assertExchange: async (exchange: string) => ({ exchange }),
      assertQueue: async (queue: string) => {
        const nombre = queue || `amq.gen-loopback-${++queueSeq}`;
        return { queue: nombre, messageCount: 0, consumerCount: 0 };
      },
      bindQueue: async (queue: string, source: string, pattern: string) => {
        bindings.push({ exchange: source, pattern, queue });
        return {};
      },
      deleteQueue: async () => ({ messageCount: 0 }),
      consume: async (queue: string, onMessage: (msg: amqp.AmqpConsumeMessage | null) => void) => {
        consumers.set(queue, onMessage);
        return { consumerTag: `ctag-${queue}` };
      },
      cancel: async () => ({}),
      ack: () => undefined,
      nack: () => undefined,
      publish: (
        exchange: string,
        routingKey: string,
        content: Buffer,
        options?: amqp.AmqpPublishOptions,
      ) => {
        const message: amqp.AmqpConsumeMessage = {
          content,
          fields: {
            deliveryTag: 1,
            redelivered: false,
            exchange,
            routingKey,
          },
          properties: {
            contentType: options?.contentType,
            deliveryMode: options?.deliveryMode,
            messageId: options?.messageId,
            correlationId: options?.correlationId,
            headers: (options?.headers ?? {}) as Record<string, unknown>,
          },
        };

        for (const binding of bindings) {
          if (binding.exchange === exchange && coincideTopic(binding.pattern, routingKey)) {
            const callback = consumers.get(binding.queue);
            if (callback) {
              setImmediate(() => callback(message));
            }
          }
        }
        return true;
      },
      close: async () => undefined,
      on: () => channel,
    };

    const connection: amqp.AmqpConnection = {
      createChannel: async () => channel,
      createConfirmChannel: async () => channel,
      close: async () => undefined,
      on: () => connection,
    };

    return connection;
  };
}

async function resolverConectorAmqp(url: string): Promise<typeof amqp.connect> {
  try {
    const probe = await amqp.connect(url, { timeout: 1000 });
    await probe.close();
    return amqp.connect;
  } catch {
    return crearLoopbackAmqpConnect();
  }
}

describe('Outbox Transaccional + RabbitMQ Relay (BE-004)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let outboxService: OutboxService;
  let mesaEstadoService: MesaEstadoService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    outboxService = moduleRef.get(OutboxService);
    mesaEstadoService = moduleRef.get(MesaEstadoService);
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Reserva","AsignacionMesero","ListaEspera","Mesa","UnionMesa","outbox_evento" CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  describe('Persistencia transaccional en PostgreSQL (ADR-006, RNF-004)', () => {
    it('persiste el cambio de entidad de dominio y los eventos en outbox_evento en la misma transacción SQL', async () => {
      const mesa = await prisma.mesa.create({
        data: { numeroMesa: 10, capacidad: 4, zona: 'Salón Principal' },
      });

      const timestamp = new Date('2026-10-21T18:00:00.000Z').toISOString();
      const diningPayload: DiningSessionIniciadaPayload = {
        sessionId: SESSION_ID,
        mesaId: mesa.id,
        unionId: null,
        meseroId: MESERO_ID,
        comensales: 4,
        timestamp,
      };
      const estadoPayload: MesaEstadoActualizadoPayload = {
        mesaId: mesa.id,
        estado: EstadoMesa.OCUPADA,
        unionId: null,
        timestamp,
      };

      await prisma.$transaction(async (tx) => {
        await tx.mesa.update({
          where: { id: mesa.id },
          data: {
            estadoFisico: EstadoMesaPrisma.Ocupada,
            ocupadaDesde: new Date(timestamp),
          },
        });

        await outboxService.enqueue(tx, {
          routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
          payload: diningPayload,
          correlationId: CORRELATION_ID,
        });

        await outboxService.enqueue(tx, {
          routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
          payload: estadoPayload,
          correlationId: CORRELATION_ID,
        });
      });

      const eventos = await prisma.outboxEvento.findMany({
        orderBy: { creadoEn: 'asc' },
      });

      expect(eventos).toHaveLength(2);
      expect(eventos[0]).toMatchObject({
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: diningPayload,
        correlationId: CORRELATION_ID,
        publicadoEn: null,
        intentos: 0,
      });
      expect(eventos[1]).toMatchObject({
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload: estadoPayload,
        correlationId: CORRELATION_ID,
        publicadoEn: null,
        intentos: 0,
      });
    });

    it('si la transacción de dominio hace rollback, no queda ningún evento en outbox_evento', async () => {
      const mesa = await prisma.mesa.create({
        data: { numeroMesa: 11, capacidad: 2, zona: 'Terraza' },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.mesa.update({
            where: { id: mesa.id },
            data: { estadoFisico: EstadoMesaPrisma.Ocupada },
          });

          await outboxService.enqueue(tx, {
            routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
            payload: {
              mesaId: mesa.id,
              estado: EstadoMesa.OCUPADA,
              unionId: null,
              timestamp: new Date().toISOString(),
            },
            correlationId: CORRELATION_ID,
          });

          throw new Error('Fallo simulado antes del commit');
        }),
      ).rejects.toThrow('Fallo simulado antes del commit');

      const mesaActual = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      const totalEventos = await prisma.outboxEvento.count();

      expect(mesaActual.estadoFisico).toBe(EstadoMesaPrisma.Libre);
      expect(totalEventos).toBe(0);
    });

    it('RF-008: MesaEstadoService encola sala.mesa.estado_actualizado al transicionar el estado físico', async () => {
      const mesa = await prisma.mesa.create({
        data: {
          numeroMesa: 12,
          capacidad: 4,
          zona: 'Principal',
          estadoFisico: EstadoMesaPrisma.Ocupada,
          ocupadaDesde: new Date('2026-10-21T17:00:00.000Z'),
        },
      });

      await mesaEstadoService.actualizarEstado(
        mesa.id,
        { estado: EstadoMesa.LIMPIEZA_PENDIENTE },
        CORRELATION_ID,
      );

      const eventos = await prisma.outboxEvento.findMany();
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        correlationId: CORRELATION_ID,
        publicadoEn: null,
        intentos: 0,
        payload: {
          mesaId: mesa.id,
          estado: EstadoMesa.LIMPIEZA_PENDIENTE,
          unionId: null,
        },
      });
    });
  });

  describe('Despacho por OutboxRelayService, reintentos y publicación en RabbitMQ (SPEC §6.1, RNF-005)', () => {
    it('incrementa intentos y conserva publicadoEn = null cuando el broker no responde, y publica al recuperarse', async () => {
      const mesa = await prisma.mesa.create({
        data: { numeroMesa: 20, capacidad: 4, zona: 'Interior' },
      });

      const payload: MesaEstadoActualizadoPayload = {
        mesaId: mesa.id,
        estado: EstadoMesa.LIMPIEZA_PENDIENTE,
        unionId: null,
        timestamp: new Date('2026-10-21T18:30:00.000Z').toISOString(),
      };

      const eventoCreado = await outboxService.enqueue(prisma, {
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload,
        correlationId: CORRELATION_ID,
      });

      // 1. Simular broker caído (puerto cerrado)
      const publisherCaido = new RabbitMqPublisher({
        url: 'amqp://guest:guest@127.0.0.1:59999',
        exchange: TEST_EXCHANGE,
        autoConnect: false,
      });
      const relayConFallo = new OutboxRelayService(prisma, publisherCaido, undefined, {
        autoStart: false,
      });

      const procesadosEnFallo = await relayConFallo.processPendingEvents();
      expect(procesadosEnFallo).toBe(0);

      const trasFallo = await prisma.outboxEvento.findUniqueOrThrow({
        where: { id: eventoCreado.id },
      });
      expect(trasFallo.publicadoEn).toBeNull();
      expect(trasFallo.intentos).toBe(1);

      // 2. Verificar publicación y recepción del mensaje AMQP con cabeceras obligatorias
      const connectFn = await resolverConectorAmqp(RABBITMQ_URL);
      let consumerConn: amqp.AmqpConnection | null = null;
      let consumerChannel: amqp.AmqpChannel | null = null;
      const publisherActivo = new RabbitMqPublisher({
        url: RABBITMQ_URL,
        exchange: TEST_EXCHANGE,
        autoConnect: false,
        connectFn,
      });

      try {
        consumerConn = await connectFn(RABBITMQ_URL, { timeout: 3000 });
        consumerChannel = await consumerConn.createChannel();
        await consumerChannel.assertExchange(TEST_EXCHANGE, 'topic', { durable: true });
        const q = await consumerChannel.assertQueue('', { exclusive: true, autoDelete: true });
        await consumerChannel.bindQueue(q.queue, TEST_EXCHANGE, 'sala.#');

        const mensajeRecibidoPromesa = new Promise<amqp.AmqpConsumeMessage>((resolve) => {
          void consumerChannel?.consume(
            q.queue,
            (msg) => {
              if (msg) {
                consumerChannel?.ack(msg);
                resolve(msg);
              }
            },
            { noAck: false },
          );
        });

        const relayRecuperado = new OutboxRelayService(prisma, publisherActivo, undefined, {
          autoStart: false,
        });

        const procesadosRecuperado = await relayRecuperado.processPendingEvents();
        expect(procesadosRecuperado).toBe(1);

        const msg = await mensajeRecibidoPromesa;
        expect(msg.fields.routingKey).toBe(EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO);
        expect(JSON.parse(msg.content.toString('utf-8'))).toEqual(payload);
        expect(msg.properties.contentType).toBe('application/json');
        expect(msg.properties.deliveryMode).toBe(2);
        expect(msg.properties.headers['x-event-id']).toBe(eventoCreado.id);
        expect(msg.properties.headers['x-correlation-id']).toBe(CORRELATION_ID);

        const trasExito = await prisma.outboxEvento.findUniqueOrThrow({
          where: { id: eventoCreado.id },
        });
        expect(trasExito.publicadoEn).not.toBeNull();
        expect(trasExito.intentos).toBe(1);
      } finally {
        await publisherActivo.disconnect();
        await consumerChannel?.close().catch(() => undefined);
        await consumerConn?.close().catch(() => undefined);
      }
    });
  });
});
