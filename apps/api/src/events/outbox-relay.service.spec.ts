import type { OutboxEvento } from '@prisma/client';
import {
  EVENT_TOPICS,
  fixtureDiningSessionIniciadaPayload,
  fixtureMesaEstadoActualizadoPayload,
} from '@floor/shared';
import type { Reloj } from '../common/reloj/reloj';
import type { PrismaService } from '../prisma/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';
import type { RabbitMqPublisher } from './rabbitmq.publisher';

const AHORA = new Date('2026-10-11T14:00:00.000Z');

function crearEventoPendiente(parcial: Partial<OutboxEvento> = {}): OutboxEvento {
  return {
    id: 'e1000000-0000-4000-8000-000000000001',
    routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
    payload: fixtureMesaEstadoActualizadoPayload as unknown as OutboxEvento['payload'],
    correlationId: 'c1000000-0000-4000-8000-000000000001',
    creadoEn: new Date('2026-10-11T13:59:55.000Z'),
    publicadoEn: null,
    intentos: 0,
    ...parcial,
  };
}

function crearDependencias() {
  const findMany = jest.fn<Promise<OutboxEvento[]>, [unknown]>().mockResolvedValue([]);
  const update = jest.fn<Promise<OutboxEvento>, [unknown]>().mockImplementation(async (args) => {
    const { where, data } = args as {
      where: { id: string };
      data: { publicadoEn?: Date; intentos?: { increment: number } };
    };
    return crearEventoPendiente({
      id: where.id,
      publicadoEn: data.publicadoEn ?? null,
      intentos: data.intentos ? data.intentos.increment : 0,
    });
  });

  const prisma = {
    outboxEvento: {
      findMany,
      update,
    },
  } as unknown as PrismaService;

  const publisher = {
    publish: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RabbitMqPublisher>;

  const reloj: Reloj = {
    ahora: () => AHORA,
  };

  return { prisma, findMany, update, publisher, reloj };
}

describe('OutboxRelayService (BE-004 · RF-008, RNF-005, ADR-006)', () => {
  it('cuando RabbitMqPublisher.publish tiene éxito, marca publicadoEn con fecha actual y notifica listeners', async () => {
    const { prisma, findMany, update, publisher, reloj } = crearDependencias();
    const evento = crearEventoPendiente();
    findMany.mockResolvedValueOnce([evento]);

    const relay = new OutboxRelayService(prisma, publisher, reloj, {
      batchSize: 25,
      maxIntentos: 5,
      autoStart: false,
    });

    const listenerOk = jest.fn();
    const listenerConError = jest.fn().mockRejectedValueOnce(new Error('Fallo en listener local'));
    const desuscribirOk = relay.registerListener(listenerOk);
    const desuscribirErr = relay.registerListener(listenerConError);

    const procesados = await relay.processPendingEvents();

    expect(procesados).toBe(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        publicadoEn: null,
        intentos: { lt: 5 },
      },
      orderBy: { creadoEn: 'asc' },
      take: 25,
    });
    expect(publisher.publish).toHaveBeenCalledWith({
      id: evento.id,
      routingKey: evento.routingKey,
      payload: evento.payload,
      correlationId: evento.correlationId,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: evento.id },
      data: { publicadoEn: AHORA },
    });
    expect(listenerOk).toHaveBeenCalledTimes(1);
    expect(listenerOk).toHaveBeenCalledWith(
      expect.objectContaining({
        id: evento.id,
        publicadoEn: AHORA,
      }),
    );

    desuscribirOk();
    desuscribirErr();
  });

  it('cuando RabbitMqPublisher.publish falla, mantiene publicadoEn: null e incrementa intentos en 1', async () => {
    const { prisma, findMany, update, publisher, reloj } = crearDependencias();
    const eventoFallido = crearEventoPendiente({
      id: 'e1000000-0000-4000-8000-000000000010',
      intentos: 2,
    });
    const eventoExitoso = crearEventoPendiente({
      id: 'e1000000-0000-4000-8000-000000000011',
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload as unknown as OutboxEvento['payload'],
    });
    findMany.mockResolvedValueOnce([eventoFallido, eventoExitoso]);

    publisher.publish
      .mockRejectedValueOnce(new Error('Broker RabbitMQ desconectado'))
      .mockResolvedValueOnce(undefined);

    const relay = new OutboxRelayService(prisma, publisher, reloj, { autoStart: false });

    const procesados = await relay.processPendingEvents();

    // El primer evento falló y el segundo se publicó con éxito sin abortar el lote
    expect(procesados).toBe(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: eventoFallido.id },
      data: {
        intentos: { increment: 1 },
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: eventoExitoso.id },
      data: {
        publicadoEn: AHORA,
      },
    });
  });

  it('maneja errores de base de datos en findMany o al actualizar intentos sin derribar el relay', async () => {
    const { prisma, findMany, update, publisher } = crearDependencias();
    const relay = new OutboxRelayService(prisma, publisher, undefined, { autoStart: false });

    findMany.mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(relay.processPendingEvents()).resolves.toBe(0);
    expect(relay.isBusy()).toBe(false);

    const evento = crearEventoPendiente();
    findMany.mockResolvedValueOnce([evento]);
    publisher.publish.mockRejectedValueOnce(new Error('Broker down'));
    update.mockRejectedValueOnce(new Error('Update failed'));

    await expect(relay.processPendingEvents()).resolves.toBe(0);
    expect(relay.isBusy()).toBe(false);
  });

  it('evita ejecuciones concurrentes solapadas mediante el bloqueo en memoria isProcessing', async () => {
    const { prisma, findMany, publisher, reloj } = crearDependencias();
    const evento = crearEventoPendiente();

    let resolverPublicacion!: () => void;
    const promesaPublicacion = new Promise<void>((resolve) => {
      resolverPublicacion = resolve;
    });

    findMany.mockResolvedValue([evento]);
    publisher.publish.mockReturnValueOnce(promesaPublicacion);

    const relay = new OutboxRelayService(prisma, publisher, reloj, { autoStart: false });

    const primeraEjecucion = relay.processPendingEvents();
    expect(relay.isBusy()).toBe(true);

    // Segunda invocación mientras la primera sigue en curso: debe retornar 0 sin consultar BD
    const segundaEjecucion = await relay.processPendingEvents();
    expect(segundaEjecucion).toBe(0);
    expect(findMany).toHaveBeenCalledTimes(1);

    resolverPublicacion();
    const resultadoPrimera = await primeraEjecucion;
    expect(resultadoPrimera).toBe(1);
    expect(relay.isBusy()).toBe(false);
  });

  it('gestiona el inicio y detención del intervalo de polling en onModuleInit y onModuleDestroy', async () => {
    jest.useFakeTimers();
    try {
      const { prisma, findMany, publisher, reloj } = crearDependencias();
      const relay = new OutboxRelayService(prisma, publisher, reloj, {
        pollIntervalMs: 500,
        autoStart: true,
      });

      relay.onModuleInit();
      // Llamar startPolling de nuevo es idempotente
      relay.startPolling();
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
      expect(findMany).toHaveBeenCalledTimes(2);

      relay.onModuleDestroy();
      // Llamar stopPolling de nuevo cuando ya está detenido es idempotente
      relay.stopPolling();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(findMany).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('despacha al publicador la estructura requerida para serializar el EventEnvelope AMQP (INT-001)', async () => {
    const { prisma, findMany, publisher, reloj } = crearDependencias();
    const evento = crearEventoPendiente({
      id: 'e1000000-0000-4000-8000-000000000099',
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: fixtureDiningSessionIniciadaPayload as unknown as OutboxEvento['payload'],
      correlationId: 'c1000000-0000-4000-8000-000000000099',
    });
    findMany.mockResolvedValueOnce([evento]);

    const relay = new OutboxRelayService(prisma, publisher, reloj, { autoStart: false });
    await relay.processPendingEvents();

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'e1000000-0000-4000-8000-000000000099',
        routingKey: 'sala.dining_session.iniciada',
        correlationId: 'c1000000-0000-4000-8000-000000000099',
        payload: fixtureDiningSessionIniciadaPayload,
      }),
    );
  });
});
