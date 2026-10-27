import {
  EstadoMesa as EstadoMesaPrisma,
  EstadoReserva as EstadoReservaPrisma,
  Prisma,
} from '@prisma/client';
import { EstadoMesa, EstadoReserva } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import type { DomainException } from '../../common/errors/domain.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  fechaAPrisma,
  fechaDesdePrisma,
  horaAPrisma,
  horaDesdePrisma,
  ReservasRepository,
} from './reservas.repository';

const CLIENT_VERSION = '6.19.3';
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const RESERVA_ID = 'b1000000-0000-4000-8000-000000000001';

function filaReservaMock(overrides: Record<string, unknown> = {}) {
  return {
    id: RESERVA_ID,
    mesaId: MESA_ID,
    nombreContacto: 'Laura Pérez',
    telefonoContacto: '+52 999 123 4567',
    cantidadPersonas: 4,
    fechaReserva: fechaAPrisma('2030-01-15'),
    horaInicio: horaAPrisma('19:00'),
    horaFin: horaAPrisma('20:30'),
    estado: EstadoReservaPrisma.Confirmada,
    alertaEmitida: false,
    ...overrides,
  };
}

function errorExclusionSolapada() {
  return new Prisma.PrismaClientUnknownRequestError(
    'ERROR: conflicting key value violates exclusion constraint "reserva_no_solapada_excl" (23P01)',
    { clientVersion: CLIENT_VERSION },
  );
}

describe('ReservasRepository', () => {
  it('convierte fechas y horas entre string y Date UTC', () => {
    const fecha = fechaAPrisma('2030-01-15');
    const hora = horaAPrisma('19:30');
    expect(fechaDesdePrisma(fecha)).toBe('2030-01-15');
    expect(horaDesdePrisma(hora)).toBe('19:30');
  });

  it('buscarMesaActiva devuelve null si no existe o está inactiva, y MesaRegistro si está activa', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: MESA_ID, activo: false })
      .mockResolvedValueOnce({
        id: MESA_ID,
        numeroMesa: 1,
        capacidad: 4,
        zona: 'Principal',
        estadoFisico: EstadoMesaPrisma.Libre,
        unionMesaId: null,
        activo: true,
        ocupadaDesde: null,
      });
    const repo = new ReservasRepository({ mesa: { findUnique } } as unknown as PrismaService);

    expect(await repo.buscarMesaActiva(MESA_ID)).toBeNull();
    expect(await repo.buscarMesaActiva(MESA_ID)).toBeNull();
    expect(await repo.buscarMesaActiva(MESA_ID)).toEqual({
      id: MESA_ID,
      numeroMesa: 1,
      capacidad: 4,
      zona: 'Principal',
      estadoFisico: EstadoMesa.LIBRE,
      unionMesaId: null,
      activo: true,
      ocupadaDesde: null,
    });
  });

  it('buscarPorId y listar mapean filas de Prisma a ReservaRegistro', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(filaReservaMock())
      .mockResolvedValueOnce(null);
    const findMany = jest.fn().mockResolvedValue([filaReservaMock()]);
    const repo = new ReservasRepository({
      reserva: { findUnique, findMany },
    } as unknown as PrismaService);

    const encontrada = await repo.buscarPorId(RESERVA_ID);
    expect(encontrada).toMatchObject({
      id: RESERVA_ID,
      mesaId: MESA_ID,
      fecha: '2030-01-15',
      horaInicio: '19:00',
      horaFin: '20:30',
      estado: EstadoReserva.CONFIRMADA,
    });
    expect(await repo.buscarPorId(RESERVA_ID)).toBeNull();

    const lista = await repo.listar({
      fecha: '2030-01-15',
      mesaId: MESA_ID,
      estado: EstadoReserva.CONFIRMADA,
    });
    expect(lista).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fechaReserva: fechaAPrisma('2030-01-15'),
          mesaId: MESA_ID,
          estado: EstadoReservaPrisma.Confirmada,
        },
      }),
    );
  });

  it('crear inserta y traduce reserva_no_solapada_excl a DomainException 409 RESERVA_SOLAPADA', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce(filaReservaMock())
      .mockRejectedValueOnce(errorExclusionSolapada());
    const repo = new ReservasRepository({ reserva: { create } } as unknown as PrismaService);

    const creada = await repo.crear({
      mesaId: MESA_ID,
      nombreContacto: 'Ana',
      telefonoContacto: '5512345678',
      cantidadPersonas: 2,
      fecha: '2030-01-15',
      horaInicio: '19:00',
      horaFin: '20:30',
    });
    expect(creada.id).toBe(RESERVA_ID);

    await expect(
      repo.crear({
        mesaId: MESA_ID,
        nombreContacto: 'Ana',
        telefonoContacto: '5512345678',
        cantidadPersonas: 2,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        horaFin: '20:30',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: CODIGO_ERROR.RESERVA_SOLAPADA }),
    });
  });

  it('crear propaga errores no conocidos de Prisma', async () => {
    const create = jest.fn().mockRejectedValue(new Error('DB connection lost'));
    const repo = new ReservasRepository({ reserva: { create } } as unknown as PrismaService);

    await expect(
      repo.crear({
        mesaId: MESA_ID,
        nombreContacto: 'Ana',
        telefonoContacto: '5512345678',
        cantidadPersonas: 2,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        horaFin: '20:30',
      }),
    ).rejects.toThrow('DB connection lost');
  });

  it('actualizar y actualizarEstado exigen estado Confirmada en where, reinician alertaEmitida: false y traducen P2025 y solapamiento (IMP-07, IMP-08)', async () => {
    const errorP2025 = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      { code: 'P2025', clientVersion: CLIENT_VERSION },
    );
    const update = jest
      .fn()
      .mockResolvedValueOnce(filaReservaMock({ alertaEmitida: false }))
      .mockRejectedValueOnce(errorExclusionSolapada())
      .mockRejectedValueOnce(errorP2025)
      .mockResolvedValueOnce(filaReservaMock({ estado: EstadoReservaPrisma.Cancelada }))
      .mockRejectedValueOnce(errorP2025);
    const repo = new ReservasRepository({ reserva: { update } } as unknown as PrismaService);

    const actualizada = await repo.actualizar(RESERVA_ID, {
      mesaId: MESA_ID,
      cantidadPersonas: 4,
      fecha: '2030-01-15',
      horaInicio: '20:00',
      horaFin: '21:30',
    });
    expect(actualizada.estado).toBe(EstadoReserva.CONFIRMADA);
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: RESERVA_ID, estado: EstadoReservaPrisma.Confirmada },
      data: {
        mesaId: MESA_ID,
        cantidadPersonas: 4,
        fechaReserva: fechaAPrisma('2030-01-15'),
        horaInicio: horaAPrisma('20:00'),
        horaFin: horaAPrisma('21:30'),
        alertaEmitida: false,
      },
    });

    await expect(
      repo.actualizar(RESERVA_ID, {
        mesaId: MESA_ID,
        cantidadPersonas: 4,
        fecha: '2030-01-15',
        horaInicio: '20:00',
        horaFin: '21:30',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: CODIGO_ERROR.RESERVA_SOLAPADA }),
    });

    await expect(
      repo.actualizar(RESERVA_ID, {
        mesaId: MESA_ID,
        cantidadPersonas: 4,
        fecha: '2030-01-15',
        horaInicio: '20:00',
        horaFin: '21:30',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: CODIGO_ERROR.TRANSICION_INVALIDA }),
    });

    const cancelada = await repo.actualizarEstado(RESERVA_ID, EstadoReserva.CANCELADA);
    expect(cancelada.estado).toBe(EstadoReserva.CANCELADA);
    expect(update).toHaveBeenNthCalledWith(4, {
      where: { id: RESERVA_ID, estado: EstadoReservaPrisma.Confirmada },
      data: { estado: EstadoReservaPrisma.Cancelada },
    });

    await expect(repo.actualizarEstado(RESERVA_ID, EstadoReserva.CANCELADA)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: CODIGO_ERROR.TRANSICION_INVALIDA }),
    });
  });

  it('enTransaccion ejecuta sobre el cliente transaccional y traduce violaciones de exclusión', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((fn: (tx: unknown) => unknown) =>
          fn({
            reserva: {
              findUnique: jest.fn().mockResolvedValue(filaReservaMock()),
            },
          }),
        )
        .mockRejectedValueOnce(errorExclusionSolapada()),
    } as unknown as PrismaService;
    const repo = new ReservasRepository(prisma);

    const encontrada = await repo.enTransaccion((txRepo) => txRepo.buscarPorId(RESERVA_ID));
    expect(encontrada?.id).toBe(RESERVA_ID);

    let capturado: DomainException | undefined;
    try {
      await repo.enTransaccion(async () => null);
    } catch (err) {
      capturado = err as DomainException;
    }
    expect(capturado?.getStatus()).toBe(409);
    expect(capturado?.getResponse()).toMatchObject({ code: CODIGO_ERROR.RESERVA_SOLAPADA });
  });

  it('listarMesasDisponibles consulta por tstzrange y mapea las mesas', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: MESA_ID,
        numeroMesa: 2,
        capacidad: 4,
        zona: 'Terraza',
        estadoFisico: EstadoMesaPrisma.Libre,
        unionMesaId: null,
        activo: true,
        ocupadaDesde: null,
      },
    ]);
    const repo = new ReservasRepository({ $queryRaw: queryRaw } as unknown as PrismaService);

    const disponibles = await repo.listarMesasDisponibles({
      fecha: '2030-01-15',
      horaInicio: '19:00',
      horaFin: '20:30',
      personas: 4,
    });

    expect(disponibles).toEqual([
      {
        id: MESA_ID,
        numeroMesa: 2,
        capacidad: 4,
        zona: 'Terraza',
        estadoFisico: EstadoMesa.LIBRE,
        unionMesaId: null,
        activo: true,
        ocupadaDesde: null,
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('BE-008 · listarParaAlertas consulta por lower("rango") con $queryRaw o filtra con findMany como fallback', async () => {
    const desde = new Date('2030-01-15T18:30:00.000Z');
    const hasta = new Date('2030-01-15T19:00:00.000Z');

    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: RESERVA_ID,
        mesaId: MESA_ID,
        nombreContacto: 'Laura Pérez',
        telefonoContacto: '+52 999 123 4567',
        cantidadPersonas: 4,
        fechaReserva: '2030-01-15',
        horaInicio: '18:45',
        horaFin: '20:15',
        estado: EstadoReservaPrisma.Confirmada,
        alertaEmitida: false,
      },
    ]);
    const repoConRaw = new ReservasRepository({ $queryRaw: queryRaw } as unknown as PrismaService);
    const porRaw = await repoConRaw.listarParaAlertas(desde, hasta);
    expect(porRaw).toEqual([
      {
        id: RESERVA_ID,
        mesaId: MESA_ID,
        nombreContacto: 'Laura Pérez',
        telefonoContacto: '+52 999 123 4567',
        cantidadPersonas: 4,
        fecha: '2030-01-15',
        horaInicio: '18:45',
        horaFin: '20:15',
        estado: EstadoReserva.CONFIRMADA,
        alertaEmitida: false,
      },
    ]);

    const findMany = jest
      .fn()
      .mockResolvedValue([
        filaReservaMock({ horaInicio: horaAPrisma('18:45'), horaFin: horaAPrisma('20:15') }),
        filaReservaMock({ id: 'fuera-ventana', horaInicio: horaAPrisma('21:00') }),
      ]);
    const repoFallback = new ReservasRepository({
      reserva: { findMany },
    } as unknown as PrismaService);
    const porFallback = await repoFallback.listarParaAlertas(desde, hasta);
    expect(porFallback).toHaveLength(1);
    expect(porFallback[0]?.id).toBe(RESERVA_ID);
  });

  it('BE-008 · marcarAlertaEmitida actualiza con updateMany exigiendo Confirmada y alertaEmitida: false', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockRejectedValueOnce(new Error('DB write error'));
    const repo = new ReservasRepository({
      reserva: { updateMany },
    } as unknown as PrismaService);

    expect(await repo.marcarAlertaEmitida(RESERVA_ID)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: RESERVA_ID,
        estado: EstadoReservaPrisma.Confirmada,
        alertaEmitida: false,
      },
      data: { alertaEmitida: true },
    });

    expect(await repo.marcarAlertaEmitida(RESERVA_ID)).toBe(false);
    await expect(repo.marcarAlertaEmitida(RESERVA_ID)).rejects.toThrow('DB write error');
  });
});
