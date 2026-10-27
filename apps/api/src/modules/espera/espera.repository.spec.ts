import { EstadoEspera as EstadoEsperaPrisma } from '@prisma/client';
import { EstadoEspera } from '@floor/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { EsperaRepository } from './espera.repository';

const ESPERA_ID = 'e1000000-0000-4000-8000-000000000001';
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const HORA = new Date('2030-01-15T12:00:00.000Z');

function filaPrisma(parcial: Record<string, unknown> = {}) {
  return {
    id: ESPERA_ID,
    nombreCliente: 'Gabriel Torres',
    telefonoContacto: '+52 999 111 2233',
    cantidadPersonas: 2,
    horaLlegada: HORA,
    estado: EstadoEsperaPrisma.En_espera,
    mesaAsignadaId: null,
    ...parcial,
  };
}

describe('EsperaRepository', () => {
  it('enTransaccion ejecuta la operación con un repositorio transaccional', async () => {
    const tx = { listaEspera: {} };
    const prisma = {
      $transaction: jest.fn((cb: (client: unknown) => Promise<unknown>) => cb(tx)),
    } as unknown as PrismaService;
    const repo = new EsperaRepository(prisma);

    const resultado = await repo.enTransaccion(async (repoTx, clientTx) => {
      expect(repoTx).toBeInstanceOf(EsperaRepository);
      expect(clientTx).toBe(tx);
      return 'ok';
    });

    expect(resultado).toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('crear, listar y buscarPorId mapean correctamente entre Prisma y EsperaRegistro', async () => {
    const create = jest.fn().mockResolvedValue(filaPrisma());
    const findMany = jest.fn().mockResolvedValue([filaPrisma()]);
    const findUnique = jest.fn().mockResolvedValueOnce(filaPrisma()).mockResolvedValueOnce(null);

    const repo = new EsperaRepository({
      listaEspera: { create, findMany, findUnique },
    } as unknown as PrismaService);

    const creado = await repo.crear(
      {
        nombreCliente: 'Gabriel Torres',
        telefonoContacto: '+52 999 111 2233',
        cantidadPersonas: 2,
      },
      HORA,
    );
    expect(creado).toEqual({
      id: ESPERA_ID,
      nombreCliente: 'Gabriel Torres',
      telefonoContacto: '+52 999 111 2233',
      cantidadPersonas: 2,
      horaLlegada: HORA,
      estado: EstadoEspera.EN_ESPERA,
      mesaAsignadaId: null,
    });

    const lista = await repo.listar([EstadoEspera.EN_ESPERA, EstadoEspera.NOTIFICADO]);
    expect(lista).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        estado: { in: [EstadoEsperaPrisma.En_espera, EstadoEsperaPrisma.Notificado] },
      },
      orderBy: [{ horaLlegada: 'asc' }, { id: 'asc' }],
    });

    await expect(repo.buscarPorId(ESPERA_ID)).resolves.toMatchObject({ id: ESPERA_ID });
    await expect(repo.buscarPorId('otro')).resolves.toBeNull();
  });

  it('transicionarEstado y marcarNotificado devuelven el registro actualizado o null ante colisión concurrente', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findUnique = jest.fn().mockResolvedValue(
      filaPrisma({
        estado: EstadoEsperaPrisma.Notificado,
        mesaAsignadaId: MESA_ID,
      }),
    );

    const repo = new EsperaRepository({
      listaEspera: { updateMany, findUnique },
    } as unknown as PrismaService);

    const notificado = await repo.marcarNotificado(ESPERA_ID, MESA_ID);
    expect(notificado).toMatchObject({
      id: ESPERA_ID,
      estado: EstadoEspera.NOTIFICADO,
      mesaAsignadaId: MESA_ID,
    });

    const colision = await repo.transicionarEstado(
      ESPERA_ID,
      EstadoEspera.EN_ESPERA,
      EstadoEspera.CANCELADO,
      null,
    );
    expect(colision).toBeNull();
  });

  it('bloquearCandidatosEnEspera usa $queryRaw (FOR UPDATE SKIP LOCKED) o findMany como fallback', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([
      {
        id: ESPERA_ID,
        nombreCliente: 'Gabriel Torres',
        telefonoContacto: '+52 999 111 2233',
        cantidadPersonas: 2,
        horaLlegada: HORA.toISOString(),
        estado: 'En espera',
        mesaAsignadaId: null,
      },
    ]);
    const repoConRaw = new EsperaRepository({ $queryRaw } as unknown as PrismaService);
    const desdeRaw = await repo.bloquearCandidatosConRaw(repoConRaw);
    expect(desdeRaw).toHaveLength(1);
    expect(desdeRaw[0].horaLlegada).toEqual(HORA);

    const findMany = jest.fn().mockResolvedValue([filaPrisma()]);
    const repoSinRaw = new EsperaRepository({
      listaEspera: { findMany },
    } as unknown as PrismaService);
    const desdeFindMany = await repoSinRaw.bloquearCandidatosEnEspera(4);
    expect(desdeFindMany).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        estado: EstadoEsperaPrisma.En_espera,
        cantidadPersonas: { lte: 4 },
      },
      orderBy: [{ horaLlegada: 'asc' }, { id: 'asc' }],
    });
  });
});

const repo = {
  bloquearCandidatosConRaw: (r: EsperaRepository) => r.bloquearCandidatosEnEspera(4),
};
