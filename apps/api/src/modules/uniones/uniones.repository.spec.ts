import {
  EstadoMesa as EstadoMesaPrisma,
  EstadoUnion as EstadoUnionPrisma,
  type Prisma,
} from '@prisma/client';
import { EstadoMesa, EstadoUnion } from '@floor/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { UnionesRepository } from './uniones.repository';

const MESA_1 = 'a1000000-0000-4000-8000-000000000001';
const MESA_2 = 'a1000000-0000-4000-8000-000000000002';
const UNION_ID = 'c1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'e1000000-0000-4000-8000-000000000001';
const AHORA = new Date('2030-01-15T12:00:00.000Z');

describe('UnionesRepository (BE-009 · RN-12..RN-14)', () => {
  it('enTransaccion ejecuta la operación con un repositorio ligado al cliente transaccional', async () => {
    const tx = {
      unionMesa: { create: jest.fn().mockResolvedValue({ id: UNION_ID }) },
    } as unknown as Prisma.TransactionClient;
    const $transaction = jest.fn((cb: (client: Prisma.TransactionClient) => Promise<string>) =>
      cb(tx),
    );
    const repo = new UnionesRepository({ $transaction } as unknown as PrismaService);

    const resultado = await repo.enTransaccion((repoTx) => repoTx.crearUnion('Terraza', AHORA));

    expect(resultado).toBe(UNION_ID);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(tx.unionMesa.create).toHaveBeenCalledWith({
      data: { zona: 'Terraza', fechaCreacion: AHORA, estado: EstadoUnionPrisma.Activa },
      select: { id: true },
    });
  });

  it('bloquearMesas convierte el estado físico y rechaza valores desconocidos', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: MESA_1,
          numeroMesa: 1,
          capacidad: 4,
          zona: 'Terraza',
          estadoFisico: 'Libre',
          unionMesaId: null,
          activo: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: MESA_1,
          numeroMesa: 1,
          capacidad: 4,
          zona: 'Terraza',
          estadoFisico: 'Desconocido',
          unionMesaId: null,
          activo: true,
        },
      ]);
    const repo = new UnionesRepository({ $queryRaw } as unknown as PrismaService);

    const mesas = await repo.bloquearMesas([MESA_1]);
    expect(mesas).toEqual([
      {
        id: MESA_1,
        numeroMesa: 1,
        capacidad: 4,
        zona: 'Terraza',
        estadoFisico: EstadoMesa.LIBRE,
        unionMesaId: null,
        activo: true,
      },
    ]);

    await expect(repo.bloquearMesas([MESA_1])).rejects.toThrow(
      'Estado de mesa desconocido: Desconocido',
    );
  });

  it('buscarReservaProxima devuelve la primera fila o null', async () => {
    const conflicto = {
      mesaId: MESA_1,
      reservaId: 'b1000000-0000-4000-8000-000000000001',
      nombreContacto: 'Ana',
      horaInicio: '12:15',
      cantidadPersonas: 4,
    };
    const $queryRaw = jest.fn().mockResolvedValueOnce([conflicto]).mockResolvedValueOnce([]);
    const repo = new UnionesRepository({ $queryRaw } as unknown as PrismaService);
    const hasta = new Date('2030-01-15T12:30:00.000Z');

    expect(await repo.buscarReservaProxima([MESA_1, MESA_2], AHORA, hasta)).toEqual(conflicto);
    expect(await repo.buscarReservaProxima([MESA_1, MESA_2], AHORA, hasta)).toBeNull();
  });

  it('ocuparMesasEnUnion y asignarMesero actualizan las filas esperadas', async () => {
    const updateManyMesa = jest.fn().mockResolvedValue({ count: 2 });
    const updateManyAsignacion = jest.fn().mockResolvedValue({ count: 1 });
    const createManyAsignacion = jest.fn().mockResolvedValue({ count: 2 });
    const repo = new UnionesRepository({
      mesa: { updateMany: updateManyMesa },
      asignacionMesero: { updateMany: updateManyAsignacion, createMany: createManyAsignacion },
    } as unknown as PrismaService);

    const count = await repo.ocuparMesasEnUnion([MESA_1, MESA_2], UNION_ID, AHORA);
    expect(count).toBe(2);
    expect(updateManyMesa).toHaveBeenCalledWith({
      where: {
        id: { in: [MESA_1, MESA_2] },
        activo: true,
        unionMesaId: null,
        estadoFisico: EstadoMesaPrisma.Libre,
      },
      data: { estadoFisico: EstadoMesaPrisma.Ocupada, unionMesaId: UNION_ID, ocupadaDesde: AHORA },
    });

    await repo.asignarMesero([MESA_1, MESA_2], MESERO_ID, AHORA);
    expect(updateManyAsignacion).toHaveBeenCalledWith({
      where: { mesaId: { in: [MESA_1, MESA_2] }, activo: true },
      data: { activo: false, fechaHoraFin: AHORA },
    });
    expect(createManyAsignacion).toHaveBeenCalledWith({
      data: [
        { mesaId: MESA_1, meseroId: MESERO_ID, fechaHoraInicio: AHORA, activo: true },
        { mesaId: MESA_2, meseroId: MESERO_ID, fechaHoraInicio: AHORA, activo: true },
      ],
    });
  });

  it('bloquearUnion, bloquearMesasDeUnion, liberarMesasDeUnion y disolverUnion operan sobre la unión', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: UNION_ID, estado: EstadoUnionPrisma.Activa }])
      .mockResolvedValueOnce([{ id: UNION_ID, estado: EstadoUnionPrisma.Disuelta }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: MESA_1 }, { id: MESA_2 }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const update = jest.fn().mockResolvedValue({});
    const repo = new UnionesRepository({
      $queryRaw,
      mesa: { updateMany },
      unionMesa: { update },
    } as unknown as PrismaService);

    expect(await repo.bloquearUnion(UNION_ID)).toEqual({
      id: UNION_ID,
      estado: EstadoUnion.ACTIVA,
    });
    expect(await repo.bloquearUnion(UNION_ID)).toEqual({
      id: UNION_ID,
      estado: EstadoUnion.DISUELTA,
    });
    expect(await repo.bloquearUnion(UNION_ID)).toBeNull();

    expect(await repo.bloquearMesasDeUnion(UNION_ID)).toEqual([MESA_1, MESA_2]);

    expect(await repo.liberarMesasDeUnion(UNION_ID)).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { unionMesaId: UNION_ID },
      data: {
        unionMesaId: null,
        estadoFisico: EstadoMesaPrisma.Limpieza_pendiente,
        ocupadaDesde: null,
      },
    });

    await repo.disolverUnion(UNION_ID, AHORA);
    expect(update).toHaveBeenCalledWith({
      where: { id: UNION_ID },
      data: { estado: EstadoUnionPrisma.Disuelta, fechaDisolucion: AHORA },
    });
  });

  it('listar mapea uniones Activa y Disuelta a UnionRegistro', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: UNION_ID,
          zona: 'Terraza',
          estado: EstadoUnionPrisma.Activa,
          fechaCreacion: AHORA,
          fechaDisolucion: null,
          mesas: [{ id: MESA_1 }, { id: MESA_2 }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: UNION_ID,
          zona: 'Terraza',
          estado: EstadoUnionPrisma.Disuelta,
          fechaCreacion: AHORA,
          fechaDisolucion: AHORA,
          mesas: [],
        },
      ]);
    const repo = new UnionesRepository({
      unionMesa: { findMany },
    } as unknown as PrismaService);

    const activas = await repo.listar(EstadoUnion.ACTIVA);
    expect(activas).toEqual([
      {
        id: UNION_ID,
        zona: 'Terraza',
        estado: EstadoUnion.ACTIVA,
        fechaCreacion: AHORA,
        fechaDisolucion: null,
        mesasIds: [MESA_1, MESA_2],
      },
    ]);

    const disueltas = await repo.listar(EstadoUnion.DISUELTA);
    expect(disueltas).toEqual([
      {
        id: UNION_ID,
        zona: 'Terraza',
        estado: EstadoUnion.DISUELTA,
        fechaCreacion: AHORA,
        fechaDisolucion: AHORA,
        mesasIds: [],
      },
    ]);
  });
});
