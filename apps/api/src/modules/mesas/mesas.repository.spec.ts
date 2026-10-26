import { EstadoMesa as EstadoMesaPrisma } from '@prisma/client';
import { EstadoMesa, EVENT_TOPICS } from '@floor/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { MesasRepository } from './mesas.repository';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const RESERVA_ID = 'b1000000-0000-4000-8000-000000000002';
const ESPERA_ID = 'c1000000-0000-4000-8000-000000000003';
const MESERO_ID = 'd1000000-0000-4000-8000-000000000009';

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

  it('tieneReservaProxima y buscarReservaProxima consultan reservas Confirmada en la ventana indicada', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          reservaId: RESERVA_ID,
          nombreContacto: 'Ana López',
          horaInicio: '12:15',
          cantidadPersonas: 4,
        },
      ])
      .mockResolvedValueOnce([{ total: 1 }]);
    const repositorio = new MesasRepository({ $queryRaw } as unknown as PrismaService);
    const desde = new Date('2030-01-15T12:00:00.000Z');
    const hasta = new Date('2030-01-15T12:30:00.000Z');

    const conflicto = await repositorio.buscarReservaProxima(MESA_ID, desde, hasta, RESERVA_ID);
    expect(conflicto).toEqual({
      reservaId: RESERVA_ID,
      nombreContacto: 'Ana López',
      horaInicio: '12:15',
      cantidadPersonas: 4,
    });

    const resultado = await repositorio.tieneReservaProxima(MESA_ID, desde, hasta);
    expect(resultado).toBe(true);
    expect($queryRaw).toHaveBeenCalledTimes(2);
  });

  it('registrarEventoOutbox inserta el payload de dominio en outbox_evento', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const repositorio = new MesasRepository({
      outboxEvento: { create },
    } as unknown as PrismaService);

    const payload = {
      sessionId: '550e8400-e29b-41d4-a716-446655440099',
      meseroId: MESERO_ID,
      comensales: 4,
      numComensales: 4,
      timestamp: '2030-01-15T12:00:00.000Z',
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

  it('ocuparMesa cubre fallback a prisma.mesa.update y cliente sin métodos de actualización', async () => {
    const ahora = new Date('2030-01-15T12:00:00.000Z');
    const update = jest.fn().mockResolvedValue({});
    const repoConUpdate = new MesasRepository({ mesa: { update } } as unknown as PrismaService);

    expect(await repoConUpdate.ocuparMesa(MESA_ID, ahora)).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: MESA_ID },
      data: {
        estadoFisico: EstadoMesaPrisma.Ocupada,
        ocupadaDesde: ahora,
      },
    });

    const repoVacio = new MesasRepository({} as unknown as PrismaService);
    expect(await repoVacio.ocuparMesa(MESA_ID, ahora)).toBe(true);
  });

  it('tieneReservaProxima cubre resultado vacío en $queryRaw y fallbacks a reserva.findFirst, reserva.count y false', async () => {
    const desde = new Date('2030-01-15T12:00:00.000Z');
    const hasta = new Date('2030-01-15T12:30:00.000Z');

    const repoQueryRawVacio = new MesasRepository({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0 }]),
    } as unknown as PrismaService);
    expect(await repoQueryRawVacio.tieneReservaProxima(MESA_ID, desde, hasta)).toBe(false);
    expect(await repoQueryRawVacio.tieneReservaProxima(MESA_ID, desde, hasta)).toBe(false);

    const count = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repoConCount = new MesasRepository({
      reserva: { count },
    } as unknown as PrismaService);
    expect(await repoConCount.tieneReservaProxima(MESA_ID, desde, hasta, RESERVA_ID)).toBe(true);
    expect(await repoConCount.tieneReservaProxima(MESA_ID, desde, hasta)).toBe(false);

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'r1',
        nombreContacto: 'Cliente',
        horaInicio: new Date('1970-01-01T14:30:00.000Z'),
        cantidadPersonas: 2,
      })
      .mockResolvedValueOnce({ id: 'r2' })
      .mockResolvedValueOnce(null);
    const repoConFindFirst = new MesasRepository({
      reserva: { findFirst },
    } as unknown as PrismaService);
    expect(await repoConFindFirst.tieneReservaProxima(MESA_ID, desde, hasta, RESERVA_ID)).toBe(
      true,
    );
    expect(await repoConFindFirst.tieneReservaProxima(MESA_ID, desde, hasta)).toBe(true);
    expect(await repoConFindFirst.tieneReservaProxima(MESA_ID, desde, hasta)).toBe(false);

    const repoSinMetodos = new MesasRepository({} as unknown as PrismaService);
    expect(await repoSinMetodos.tieneReservaProxima(MESA_ID, desde, hasta)).toBe(false);

    // registrarEventoOutbox cuando outboxEvento no existe en prisma
    await expect(
      repoSinMetodos.registrarEventoOutbox({
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: {},
        correlationId: 'c1',
      }),
    ).resolves.toBeUndefined();
  });

  it('completarReservaEnOcupacion, sentarEsperaEnOcupacion y registrarAsignacionEnOcupacion cubren todos sus caminos', async () => {
    const ahora = new Date('2030-01-15T12:00:00.000Z');
    const reservaUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const reservaFindUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: RESERVA_ID })
      .mockResolvedValueOnce(null);

    const esperaUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const esperaFindUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: ESPERA_ID })
      .mockResolvedValueOnce(null);

    const asignacionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const asignacionCreate = jest.fn().mockResolvedValue({});

    const repo = new MesasRepository({
      reserva: { updateMany: reservaUpdateMany, findUnique: reservaFindUnique },
      listaEspera: { updateMany: esperaUpdateMany, findUnique: esperaFindUnique },
      asignacionMesero: { updateMany: asignacionUpdateMany, create: asignacionCreate },
    } as unknown as PrismaService);

    expect(await repo.completarReservaEnOcupacion(RESERVA_ID, MESA_ID)).toBe('OK');
    expect(await repo.completarReservaEnOcupacion(RESERVA_ID, MESA_ID)).toBe('INVALIDA');
    expect(await repo.completarReservaEnOcupacion(RESERVA_ID, MESA_ID)).toBe('NO_EXISTE');

    expect(await repo.sentarEsperaEnOcupacion(ESPERA_ID, MESA_ID)).toBe('OK');
    expect(await repo.sentarEsperaEnOcupacion(ESPERA_ID, MESA_ID)).toBe('INVALIDA');
    expect(await repo.sentarEsperaEnOcupacion(ESPERA_ID, MESA_ID)).toBe('NO_EXISTE');

    await repo.registrarAsignacionEnOcupacion(MESA_ID, MESERO_ID, ahora);
    expect(asignacionUpdateMany).toHaveBeenCalledWith({
      where: { mesaId: MESA_ID, activo: true },
      data: { activo: false, fechaHoraFin: ahora },
    });
    expect(asignacionCreate).toHaveBeenCalledWith({
      data: {
        mesaId: MESA_ID,
        meseroId: MESERO_ID,
        fechaHoraInicio: ahora,
        activo: true,
      },
    });

    // Fallbacks sin findUnique o sin modelos en prisma
    const repoSinFindUnique = new MesasRepository({
      reserva: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      listaEspera: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService);
    expect(await repoSinFindUnique.completarReservaEnOcupacion(RESERVA_ID, MESA_ID)).toBe(
      'INVALIDA',
    );
    expect(await repoSinFindUnique.sentarEsperaEnOcupacion(ESPERA_ID, MESA_ID)).toBe('INVALIDA');

    const repoVacio = new MesasRepository({} as unknown as PrismaService);
    expect(await repoVacio.completarReservaEnOcupacion(RESERVA_ID, MESA_ID)).toBe('OK');
    expect(await repoVacio.sentarEsperaEnOcupacion(ESPERA_ID, MESA_ID)).toBe('OK');
    await expect(
      repoVacio.registrarAsignacionEnOcupacion(MESA_ID, MESERO_ID, ahora),
    ).resolves.toBeUndefined();
  });

  it('cubre operaciones CRUD y consultas de MesasRepository (listar, listarEnVivo, buscarPorId, existeMesaActivaConNumero, crear, actualizar, darDeBaja, reservas)', async () => {
    const filaBase = {
      id: MESA_ID,
      numeroMesa: 5,
      capacidad: 4,
      zona: 'Terraza',
      estadoFisico: EstadoMesaPrisma.Libre,
      unionMesaId: null,
      activo: true,
      ocupadaDesde: null,
    };

    const prismaMock = {
      mesa: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([filaBase])
          .mockResolvedValueOnce([filaBase])
          .mockResolvedValueOnce([
            { ...filaBase, asignaciones: [{ meseroId: 'm-1' }] },
            { ...filaBase, id: 'm-2', asignaciones: [] },
          ]),
        findUnique: jest.fn().mockResolvedValueOnce(filaBase).mockResolvedValueOnce(null),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        create: jest.fn().mockResolvedValue(filaBase),
        update: jest.fn().mockResolvedValue(filaBase),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ mesaId: MESA_ID, inicio: new Date('2030-01-15T12:10:00.000Z') }]),
    } as unknown as PrismaService;

    const repo = new MesasRepository(prismaMock);

    const listadas = await repo.listar({
      zona: 'Terraza',
      estado: EstadoMesa.LIBRE,
      incluirInactivas: false,
    });
    expect(listadas).toHaveLength(1);

    const listadasInactivas = await repo.listar({ incluirInactivas: true });
    expect(listadasInactivas).toHaveLength(1);

    const enVivo = await repo.listarEnVivo();
    expect(enVivo[0]?.meseroId).toBe('m-1');
    expect(enVivo[1]?.meseroId).toBeNull();

    expect((await repo.buscarPorId(MESA_ID))?.id).toBe(MESA_ID);
    expect(await repo.buscarPorId('inexistente')).toBeNull();

    expect(await repo.existeMesaActivaConNumero(5)).toBe(true);
    expect(await repo.existeMesaActivaConNumero(5, MESA_ID)).toBe(false);

    expect((await repo.crear({ numeroMesa: 5, capacidad: 4, zona: 'Terraza' })).numeroMesa).toBe(5);
    expect((await repo.actualizar(MESA_ID, { capacidad: 6 })).id).toBe(MESA_ID);
    await repo.darDeBaja(MESA_ID);

    const ahora = new Date('2030-01-15T12:00:00.000Z');
    expect(await repo.contarReservasConfirmadasFuturas(MESA_ID, ahora)).toBe(2);
    expect(await repo.contarReservasConfirmadasFuturas(MESA_ID, ahora)).toBe(0);
    expect(
      await repo.reservasConfirmadasEntre(ahora, new Date('2030-01-15T12:30:00.000Z')),
    ).toHaveLength(1);
  });
});
