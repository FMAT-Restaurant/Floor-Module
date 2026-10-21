import { EstadoMesa as EstadoMesaPrisma } from '@prisma/client';
import { EstadoMesa } from '@floor/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { MesasRepository } from './mesas.repository';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';

function repositorioConCount(count: number) {
  const updateMany = jest.fn().mockResolvedValue({ count });
  const repositorio = new MesasRepository({ mesa: { updateMany } } as unknown as PrismaService);
  return { repositorio, updateMany };
}

describe('MesasRepository.transicionarEstado (RN-06, RN-07)', () => {
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
