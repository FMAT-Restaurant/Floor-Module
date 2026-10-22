import type { OutboxEvento } from '@prisma/client';
import {
  EVENT_TOPICS,
  fixtureDiningSessionIniciadaPayload,
  fixtureMesaEstadoActualizadoPayload,
  fixtureReservaProximaAlertaPayload,
} from '@floor/shared';
import type { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_OUTBOX_BATCH_SIZE,
  DEFAULT_RABBITMQ_EXCHANGE,
  EventsModule,
  OutboxService,
  type OutboxTransactionClient,
} from './index';

const EVENT_ID = 'f1000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'c1000000-0000-4000-8000-000000000099';
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function crearTxMock(): {
  tx: OutboxTransactionClient;
  createMock: jest.Mock<Promise<OutboxEvento>, [unknown]>;
} {
  const createMock = jest.fn<Promise<OutboxEvento>, [unknown]>().mockImplementation(async (arg) => {
    const { data } = arg as {
      data: {
        routingKey: string;
        payload: unknown;
        correlationId: string;
        intentos: number;
      };
    };
    return {
      id: EVENT_ID,
      routingKey: data.routingKey,
      payload: data.payload as OutboxEvento['payload'],
      correlationId: data.correlationId,
      creadoEn: new Date('2026-10-11T13:45:00.000Z'),
      publicadoEn: null,
      intentos: data.intentos,
    };
  });

  return {
    tx: {
      outboxEvento: {
        create: createMock,
      },
    } as unknown as OutboxTransactionClient,
    createMock,
  };
}

describe('OutboxService (BE-004 · RF-008, RNF-005, ADR-006)', () => {
  let service: OutboxService;

  beforeEach(() => {
    service = new OutboxService();
  });

  it('exporta correctamente EventsModule y constantes desde el índice público', () => {
    expect(EventsModule).toBeDefined();
    expect(DEFAULT_OUTBOX_BATCH_SIZE).toBe(50);
    expect(DEFAULT_RABBITMQ_EXCHANGE).toBe('sala.events');
  });

  it('inserta en outbox_evento usando el TransactionClient (tx) con routingKey, payload, correlationId e intentos = 0', async () => {
    const { tx, createMock } = crearTxMock();

    const resultado = await service.enqueue(tx, {
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload,
      correlationId: CORRELATION_ID,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: fixtureDiningSessionIniciadaPayload,
        correlationId: CORRELATION_ID,
        intentos: 0,
      },
    });
    expect(resultado).toMatchObject({
      id: EVENT_ID,
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload,
      correlationId: CORRELATION_ID,
      publicadoEn: null,
      intentos: 0,
    });
  });

  it('soporta todos los topics oficiales de EVENT_TOPICS (estado_actualizado y proxima_alerta)', async () => {
    const { tx, createMock } = crearTxMock();

    await service.enqueue(tx, {
      routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
      payload: fixtureMesaEstadoActualizadoPayload,
      correlationId: CORRELATION_ID,
    });

    await service.enqueue(tx, {
      routingKey: EVENT_TOPICS.RESERVA_PROXIMA_ALERTA,
      payload: fixtureReservaProximaAlertaPayload,
      correlationId: CORRELATION_ID,
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenNthCalledWith(1, {
      data: {
        routingKey: 'sala.mesa.estado_actualizado',
        payload: fixtureMesaEstadoActualizadoPayload,
        correlationId: CORRELATION_ID,
        intentos: 0,
      },
    });
    expect(createMock).toHaveBeenNthCalledWith(2, {
      data: {
        routingKey: 'sala.reserva.proxima_alerta',
        payload: fixtureReservaProximaAlertaPayload,
        correlationId: CORRELATION_ID,
        intentos: 0,
      },
    });
  });

  it('genera un UUID v4 como correlationId cuando no se proporciona o viene vacío', async () => {
    const { tx, createMock } = crearTxMock();

    const sinCorrelation = await service.enqueue(tx, {
      routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
      payload: fixtureMesaEstadoActualizadoPayload,
    });

    const conCorrelationVacio = await service.enqueue(tx, {
      routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
      payload: fixtureMesaEstadoActualizadoPayload,
      correlationId: '   ',
    });

    expect(sinCorrelation.correlationId).toMatch(UUID_V4_REGEX);
    expect(conCorrelationVacio.correlationId).toMatch(UUID_V4_REGEX);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('permite usar PrismaService por defecto o el alias enqueueEvent en ambas sobrecargas', async () => {
    const { tx, createMock } = crearTxMock();
    const conPrisma = new OutboxService(tx as unknown as PrismaService);

    await conPrisma.enqueue({
      routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
      payload: fixtureMesaEstadoActualizadoPayload,
      correlationId: CORRELATION_ID,
    });

    await conPrisma.enqueueEvent({
      routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
      payload: fixtureMesaEstadoActualizadoPayload,
      correlationId: CORRELATION_ID,
    });

    await conPrisma.enqueueEvent(tx, {
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload,
      correlationId: CORRELATION_ID,
    });

    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('rechaza routingKey desconocida, payload inválido o falta de cliente transaccional', async () => {
    const { tx } = crearTxMock();

    expect(() =>
      service.enqueue(tx, {
        routingKey:
          'sala.evento.inexistente' as unknown as typeof EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload: fixtureMesaEstadoActualizadoPayload,
      }),
    ).toThrow(/Routing key de Outbox inválida/);

    expect(() =>
      service.enqueue(tx, {
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload: null as unknown as typeof fixtureMesaEstadoActualizadoPayload,
      }),
    ).toThrow(/payload del evento Outbox debe ser un objeto JSON válido/);

    expect(() =>
      service.enqueue({
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload: fixtureMesaEstadoActualizadoPayload,
      }),
    ).toThrow(/Se requiere un TransactionClient/);

    expect(() =>
      (service as unknown as { enqueue: (txArg: unknown) => unknown }).enqueue(tx),
    ).toThrow(/Se requiere el evento de dominio/);
  });
});
