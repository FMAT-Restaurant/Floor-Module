import type * as amqp from 'amqplib';
import { EVENT_TOPICS, fixtureDiningSessionIniciadaPayload } from '@floor/shared';
import {
  DEFAULT_RABBITMQ_EXCHANGE,
  EXCHANGE_TYPE_TOPIC,
  RabbitMqPublisher,
} from './rabbitmq.publisher';

const EVENT_ID = 'e1000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'c1000000-0000-4000-8000-000000000001';
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AmqpMocks {
  connectFn: jest.Mock<Promise<amqp.AmqpConnection>, [string, Record<string, unknown>?]>;
  connection: jest.Mocked<amqp.AmqpConnection>;
  channel: jest.Mocked<amqp.AmqpChannel>;
  connectionHandlers: Map<string, (...args: unknown[]) => void>;
  channelHandlers: Map<string, (...args: unknown[]) => void>;
}

function crearAmqpMocks(): AmqpMocks {
  const connectionHandlers = new Map<string, (...args: unknown[]) => void>();
  const channelHandlers = new Map<string, (...args: unknown[]) => void>();

  const channel = {
    assertExchange: jest.fn().mockResolvedValue({ exchange: DEFAULT_RABBITMQ_EXCHANGE }),
    publish: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((evento: string, listener: (...args: unknown[]) => void) => {
      channelHandlers.set(evento, listener);
      return channel;
    }),
  } as unknown as jest.Mocked<amqp.AmqpChannel>;

  const connection = {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((evento: string, listener: (...args: unknown[]) => void) => {
      connectionHandlers.set(evento, listener);
      return connection;
    }),
  } as unknown as jest.Mocked<amqp.AmqpConnection>;

  const connectFn = jest
    .fn<Promise<amqp.AmqpConnection>, [string, Record<string, unknown>?]>()
    .mockResolvedValue(connection);

  return {
    connectFn,
    connection,
    channel,
    connectionHandlers,
    channelHandlers,
  };
}

describe('RabbitMqPublisher (BE-004 · SPEC §6.1, ADR-003, ADR-006)', () => {
  it('asegura el exchange topic durable y publica con las cabeceras AMQP obligatorias', async () => {
    const { connectFn, channel } = crearAmqpMocks();
    const publisher = new RabbitMqPublisher({
      url: 'amqp://guest:guest@localhost:5672',
      exchange: 'sala.events',
      connectFn,
    });

    expect(publisher.getExchange()).toBe('sala.events');

    await publisher.publish({
      id: EVENT_ID,
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload,
      correlationId: CORRELATION_ID,
    });

    expect(connectFn).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672', { timeout: 3000 });
    expect(channel.assertExchange).toHaveBeenCalledWith('sala.events', EXCHANGE_TYPE_TOPIC, {
      durable: true,
    });
    expect(channel.publish).toHaveBeenCalledTimes(1);

    const [exchange, routingKey, buffer, options] = channel.publish.mock.calls[0];
    expect(exchange).toBe('sala.events');
    expect(routingKey).toBe(EVENT_TOPICS.DINING_SESSION_INICIADA);
    const envelope = JSON.parse(buffer.toString('utf-8'));
    expect(envelope).toEqual({
      eventId: EVENT_ID,
      eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
      timestamp: expect.any(String),
      correlationId: CORRELATION_ID,
      data: fixtureDiningSessionIniciadaPayload,
    });
    expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);
    expect(options).toEqual({
      contentType: 'application/json',
      deliveryMode: 2,
      persistent: true,
      messageId: EVENT_ID,
      correlationId: CORRELATION_ID,
      headers: {
        'x-event-id': EVENT_ID,
        'x-correlation-id': CORRELATION_ID,
      },
    });
    expect(publisher.isConnected()).toBe(true);
  });

  it('genera un correlationId UUID v4 si el registro Outbox tiene correlationId nulo', async () => {
    const { connectFn, channel } = crearAmqpMocks();
    const publisher = new RabbitMqPublisher({ connectFn });

    await publisher.publish({
      id: EVENT_ID,
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload,
      correlationId: null,
    });

    const [, , bufferNulo, options] = channel.publish.mock.calls[0];
    const envelopeNulo = JSON.parse(bufferNulo.toString('utf-8'));
    expect(options?.correlationId).toMatch(UUID_V4_REGEX);
    expect(envelopeNulo.correlationId).toBe(options?.correlationId);
    expect(envelopeNulo.eventId).toBe(EVENT_ID);
    expect(envelopeNulo.eventType).toBe(EVENT_TOPICS.DINING_SESSION_INICIADA);
    expect(envelopeNulo.data).toEqual(fixtureDiningSessionIniciadaPayload);
    expect(options?.headers?.['x-event-id']).toBe(EVENT_ID);
    expect(options?.headers?.['x-correlation-id']).toBe(options?.correlationId);
  });

  it('onModuleInit es resiliente si RabbitMQ está caído y no derriba el arranque de NestJS', async () => {
    const { connectFn } = crearAmqpMocks();
    connectFn.mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:5672'));

    const publisher = new RabbitMqPublisher({
      connectFn,
      autoConnect: true,
    });

    await expect(publisher.onModuleInit()).resolves.toBeUndefined();
    expect(publisher.isConnected()).toBe(false);

    // Con autoConnect=false no abre conexión en onModuleInit
    const publisherSinAuto = new RabbitMqPublisher({
      connectFn,
      autoConnect: false,
    });
    await publisherSinAuto.onModuleInit();
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it('reconecta automáticamente al publicar tras eventos error y close de canal o conexión', async () => {
    const { connectFn, channel, connectionHandlers, channelHandlers } = crearAmqpMocks();
    const publisher = new RabbitMqPublisher({ connectFn });

    await publisher.connect();
    expect(publisher.isConnected()).toBe(true);

    // Simular error y cierre de canal
    channelHandlers.get('error')?.(new Error('Channel error'));
    channelHandlers.get('close')?.();
    expect(publisher.isConnected()).toBe(false);

    // Reconectar y luego simular error y cierre de conexión
    await publisher.connect();
    expect(publisher.isConnected()).toBe(true);
    connectionHandlers.get('error')?.(new Error('Connection error'));
    connectionHandlers.get('close')?.();
    expect(publisher.isConnected()).toBe(false);

    // Publicaciones concurrentes reutilizan la misma promesa de conexión
    await Promise.all([
      publisher.publish({
        id: EVENT_ID,
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: fixtureDiningSessionIniciadaPayload,
        correlationId: CORRELATION_ID,
      }),
      publisher.publish({
        id: EVENT_ID,
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: fixtureDiningSessionIniciadaPayload,
        correlationId: CORRELATION_ID,
      }),
    ]);

    expect(connectFn).toHaveBeenCalledTimes(3);
    expect(channel.publish).toHaveBeenCalledTimes(2);
    expect(publisher.isConnected()).toBe(true);
  });

  it('lanza error si el buffer del canal AMQP rechaza la publicación (publish = false)', async () => {
    const { connectFn, channel } = crearAmqpMocks();
    channel.publish.mockReturnValueOnce(false);
    const publisher = new RabbitMqPublisher({ connectFn });

    await expect(
      publisher.publish({
        id: EVENT_ID,
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: fixtureDiningSessionIniciadaPayload,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(/rechazó la publicación por saturación de buffer/);
  });

  it('cierra limpiamente canal y conexión en onModuleDestroy incluso si close arroja error', async () => {
    const { connectFn, channel, connection } = crearAmqpMocks();
    channel.close.mockRejectedValueOnce(new Error('Channel already closed'));
    connection.close.mockRejectedValueOnce(new Error('Connection already closed'));
    const publisher = new RabbitMqPublisher({ connectFn });

    await publisher.connect();
    expect(publisher.isConnected()).toBe(true);

    await expect(publisher.onModuleDestroy()).resolves.toBeUndefined();

    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(publisher.isConnected()).toBe(false);
  });

  it('preserva EventEnvelope pre-construido en payload (con y sin correlationId interno)', async () => {
    const { connectFn, channel } = crearAmqpMocks();
    const publisher = new RabbitMqPublisher({ connectFn });

    const envelopeConCorr = {
      eventId: EVENT_ID,
      eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
      timestamp: '2030-01-15T12:00:00.000Z',
      correlationId: CORRELATION_ID,
      data: fixtureDiningSessionIniciadaPayload,
    };

    await publisher.publish({
      id: EVENT_ID,
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: envelopeConCorr,
      correlationId: CORRELATION_ID,
    });

    const buffer1 = channel.publish.mock.calls[0]?.[2] as Buffer;
    expect(JSON.parse(buffer1.toString('utf-8'))).toEqual(envelopeConCorr);

    const envelopeSinCorr = {
      eventId: EVENT_ID,
      eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
      timestamp: '2030-01-15T12:00:00.000Z',
      data: fixtureDiningSessionIniciadaPayload,
    };

    await publisher.publish({
      id: EVENT_ID,
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: envelopeSinCorr as unknown as typeof envelopeConCorr,
      correlationId: CORRELATION_ID,
    });

    const buffer2 = channel.publish.mock.calls[1]?.[2] as Buffer;
    expect(JSON.parse(buffer2.toString('utf-8')).correlationId).toBe(CORRELATION_ID);
  });
});
