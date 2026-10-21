import type { PrismaService } from '../../prisma/prisma.service';
import { AsignacionesRepository } from './asignaciones.repository';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'b1000000-0000-4000-8000-000000000001';
const ASIGNACION_ID = 'f1000000-0000-4000-8000-000000000001';
const INICIO = new Date('2030-01-15T11:00:00.000Z');
const FIN = new Date('2030-01-15T12:00:00.000Z');

const FILA = {
  id: ASIGNACION_ID,
  mesaId: MESA_ID,
  meseroId: MESERO_ID,
  fechaHoraInicio: INICIO,
  fechaHoraFin: null as Date | null,
  activo: true,
};

describe('AsignacionesRepository (RN-16)', () => {
  it('enTransaccion ejecuta la operación con un repositorio ligado al cliente transaccional', async () => {
    const findFirstTx = jest.fn().mockResolvedValue(FILA);
    const prisma = {
      asignacionMesero: { findFirst: jest.fn() },
      $transaction: jest.fn((operacion: (tx: unknown) => unknown) =>
        operacion({ asignacionMesero: { findFirst: findFirstTx } }),
      ),
    } as unknown as PrismaService;
    const repositorio = new AsignacionesRepository(prisma);

    const resultado = await repositorio.enTransaccion((repo) => repo.buscarActivaPorMesa(MESA_ID));

    expect(resultado).toEqual(FILA);
    expect(findFirstTx).toHaveBeenCalledWith({ where: { mesaId: MESA_ID, activo: true } });
    expect(prisma.asignacionMesero.findFirst).not.toHaveBeenCalled();
  });

  it('bloquearMesaActiva devuelve true cuando la mesa existe y está activa, y false cuando no', async () => {
    const $queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: MESA_ID }])
      .mockResolvedValueOnce([]);
    const repositorio = new AsignacionesRepository({ $queryRaw } as unknown as PrismaService);

    await expect(repositorio.bloquearMesaActiva(MESA_ID)).resolves.toBe(true);
    await expect(repositorio.bloquearMesaActiva(MESA_ID)).resolves.toBe(false);
  });

  it('buscarActivaPorMesa devuelve null si no hay asignación activa', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repositorio = new AsignacionesRepository({
      asignacionMesero: { findFirst },
    } as unknown as PrismaService);

    await expect(repositorio.buscarActivaPorMesa(MESA_ID)).resolves.toBeNull();
  });

  it('cerrar actualiza activo=false y fechaHoraFin', async () => {
    const update = jest.fn().mockResolvedValue({ ...FILA, fechaHoraFin: FIN, activo: false });
    const repositorio = new AsignacionesRepository({
      asignacionMesero: { update },
    } as unknown as PrismaService);

    const cerrada = await repositorio.cerrar(ASIGNACION_ID, FIN);

    expect(update).toHaveBeenCalledWith({
      where: { id: ASIGNACION_ID },
      data: { activo: false, fechaHoraFin: FIN },
    });
    expect(cerrada.activo).toBe(false);
    expect(cerrada.fechaHoraFin).toBe(FIN);
  });

  it('crear inserta una asignación activa con fechaHoraFin null', async () => {
    const create = jest.fn().mockResolvedValue(FILA);
    const repositorio = new AsignacionesRepository({
      asignacionMesero: { create },
    } as unknown as PrismaService);

    const creada = await repositorio.crear({
      mesaId: MESA_ID,
      meseroId: MESERO_ID,
      fechaHoraInicio: INICIO,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        mesaId: MESA_ID,
        meseroId: MESERO_ID,
        fechaHoraInicio: INICIO,
        fechaHoraFin: null,
        activo: true,
      },
    });
    expect(creada).toEqual(FILA);
  });

  it('listar aplica filtro por defecto activo=true y opcionalmente meseroId', async () => {
    const findMany = jest.fn().mockResolvedValue([FILA]);
    const repositorio = new AsignacionesRepository({
      asignacionMesero: { findMany },
    } as unknown as PrismaService);

    await repositorio.listar({});
    expect(findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: [{ fechaHoraInicio: 'desc' }, { id: 'asc' }],
    });

    await repositorio.listar({ meseroId: MESERO_ID, activo: false });
    expect(findMany).toHaveBeenLastCalledWith({
      where: { activo: false, meseroId: MESERO_ID },
      orderBy: [{ fechaHoraInicio: 'desc' }, { id: 'asc' }],
    });
  });
});
