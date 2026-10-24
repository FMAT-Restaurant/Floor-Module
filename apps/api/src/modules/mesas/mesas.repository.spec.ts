import { EstadoMesa as EstadoMesaPrisma } from '@prisma/client';
import { EstadoMesa, EVENT_TOPICS } from '@floor/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { MesasRepository } from './mesas.repository';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';

function repositorioConCount(count: number) {
  const updateMany = jest.fn().mockResolvedValue({ count });
  const repositorio = new MesasRepository({ mesa: { updateMany } } as unknown as PrismaService);
  return { repositorio, updateMany };
}

describe('MesasRepository.transicionarEstado y ocuparMesa (RN-01, RN-04, RN-06, RN-07)', () => {
  it('actualiza sólo si la mesa sigue activa, sin unión y en el estado de origen', async () => {
    const { repositorio, updateMany } = repositorioConCount(1);

    const aplicada = await repositorio.transicionarEstado(
      MESA_ID,
      EstadoMesa.OCUPADA,
      EstadoMesa.LIMPIEZA_PENDIENTE,
    );

    expect(aplicada).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: MESA_ID,
        activo: true,
        unionMesaId: null,
        estadoFisico: EstadoMesaPrisma.Ocupada,
      },
      data: { estadoFisico: EstadoMesaPrisma.Limpieza_pendiente, ocupadaDesde: null },
    });
  });

  it('devuelve false si ninguna fila cumplía las condiciones', async () => {
    const { repositorio } = repositorioConCount(0);

    const aplicada = await repositorio.transicionarEstado(
      MESA_ID,
      EstadoMesa.LIMPIEZA_PENDIENTE,
      EstadoMesa.LIBRE,
    );

    expect(aplicada).toBe(false);
  });

  it('ocuparMesa transiciona de Libre a Ocupada fijando ocupadaDesde', async () => {
    const { repositorio, updateMany } = repositorioConCount(1);
    const ahora = new Date('2030-01-15T12:00:00.000Z');

    const aplicada = await repositorio.ocuparMesa(MESA_ID, ahora);

    expect(aplicada).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: MESA_ID,
        activo: true,
        unionMesaId: null,
        estadoFisico: EstadoMesaPrisma.Libre,
      },
      data: {
        estadoFisico: EstadoMesaPrisma.Ocupada,
        ocupadaDesde: ahora,
      },
    });
  });

  it('tieneReservaProxima consulta reservas Confirmada en la ventana indicada', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{ total: 1 }]);
    const repositorio = new MesasRepository({ $queryRaw } as unknown as PrismaService);
    const desde = new Date('2030-01-15T12:00:00.000Z');
    const hasta = new Date('2030-01-15T12:30:00.000Z');

    const resultado = await repositorio.tieneReservaProxima(MESA_ID, desde, hasta);

    expect(resultado).toBe(true);
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });

  it('registrarEventoOutbox inserta el EventEnvelope en outbox_evento', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const repositorio = new MesasRepository({
      outboxEvento: { create },
    } as unknown as PrismaService);

    const payload = {
      eventId: 'e1000000-0000-4000-8000-000000000001',
      eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
      timestamp: '2030-01-15T12:00:00.000Z',
      correlationId: 'corr-1',
      data: {
        sessionId: '550e8400-e29b-41d4-a716-446655440099',
        meseroId: 'd1000000-0000-4000-8000-000000000001',
        comensales: 4,
        numComensales: 4,
        timestamp: '2030-01-15T12:00:00.000Z',
      },
    };

    await repositorio.registrarEventoOutbox({
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload,
      correlationId: 'corr-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload,
        correlationId: 'corr-1',
        intentos: 0,
      },
    });
  });

  it('enTransaccion entrega un repositorio que usa el cliente de la transacción', async () => {
    const updateManyTx = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      mesa: { updateMany: jest.fn() },
      $transaction: jest.fn((operacion: (tx: unknown) => unknown) =>
        operacion({ mesa: { updateMany: updateManyTx } }),
      ),
    } as unknown as PrismaService;
    const repositorio = new MesasRepository(prisma);

    const aplicada = await repositorio.enTransaccion((repo) =>
      repo.transicionarEstado(MESA_ID, EstadoMesa.OCUPADA, EstadoMesa.LIMPIEZA_PENDIENTE),
    );

    expect(aplicada).toBe(true);
    expect(updateManyTx).toHaveBeenCalledTimes(1);
    expect(prisma.mesa.updateMany).not.toHaveBeenCalled();
  });
});
