import { EstadoMesa } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import type { DomainException } from '../../common/errors/domain.exception';
import type { MesaRegistro } from './mesa.registro';
import { MesaEstadoService } from './mesa-estado.service';
import type { MesasRepository } from './mesas.repository';

const { LIBRE, OCUPADA, LIMPIEZA_PENDIENTE } = EstadoMesa;
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const UNION_ID = 'c1000000-0000-4000-8000-000000000001';

function mesa(parcial: Partial<MesaRegistro> = {}): MesaRegistro {
  return {
    id: MESA_ID,
    numeroMesa: 1,
    capacidad: 4,
    zona: 'Principal',
    estadoFisico: OCUPADA,
    unionMesaId: null,
    activo: true,
    ocupadaDesde: new Date('2030-01-15T11:15:00.000Z'),
    ...parcial,
  };
}

function crearRepositorio(): jest.Mocked<MesasRepository> {
  const repo = {
    enTransaccion: jest.fn((operacion: (r: MesasRepository) => Promise<unknown>) =>
      operacion(repo),
    ),
    buscarPorId: jest.fn(),
    transicionarEstado: jest.fn(),
  } as unknown as jest.Mocked<MesasRepository>;
  return repo;
}

async function capturar(promesa: Promise<unknown>): Promise<DomainException> {
  try {
    await promesa;
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('MesaEstadoService · cambio manual de estado (SPEC §5.2)', () => {
  let repositorio: jest.Mocked<MesasRepository>;
  let servicio: MesaEstadoService;

  beforeEach(() => {
    repositorio = crearRepositorio();
    servicio = new MesaEstadoService(repositorio);
  });

  describe('transiciones permitidas', () => {
    it('RN-06: Ocupada → Limpieza pendiente, dentro de una transacción', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: OCUPADA }));
      repositorio.transicionarEstado.mockResolvedValue(true);

      const resultado = await servicio.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE });

      expect(resultado).toEqual({ mesaId: MESA_ID, estado: 'Limpieza pendiente' });
      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(repositorio.transicionarEstado).toHaveBeenCalledWith(
        MESA_ID,
        OCUPADA,
        LIMPIEZA_PENDIENTE,
      );
    });

    it('RN-07: Limpieza pendiente → Libre', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIMPIEZA_PENDIENTE, ocupadaDesde: null }),
      );
      repositorio.transicionarEstado.mockResolvedValue(true);

      const resultado = await servicio.actualizarEstado(MESA_ID, { estado: LIBRE });

      expect(resultado).toEqual({ mesaId: MESA_ID, estado: 'Libre' });
      expect(repositorio.transicionarEstado).toHaveBeenCalledWith(
        MESA_ID,
        LIMPIEZA_PENDIENTE,
        LIBRE,
      );
    });
  });

  describe('RN-07 · transiciones rechazadas → 409 TRANSICION_INVALIDA', () => {
    it.each([
      [LIBRE, LIMPIEZA_PENDIENTE],
      [LIBRE, LIBRE],
      [OCUPADA, LIBRE],
      [LIMPIEZA_PENDIENTE, LIMPIEZA_PENDIENTE],
    ] as const)('%s → %s', async (origen, destino) => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: origen }));

      const error = await capturar(servicio.actualizarEstado(MESA_ID, { estado: destino }));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        code: CODIGO_ERROR.TRANSICION_INVALIDA,
        details: { mesaId: MESA_ID, desde: origen, hacia: destino },
      });
      expect(repositorio.transicionarEstado).not.toHaveBeenCalled();
    });

    it('informa en `details.permitidas` a qué estados se puede pasar', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: OCUPADA }));

      const error = await capturar(servicio.actualizarEstado(MESA_ID, { estado: LIBRE }));

      expect(error.getResponse()).toMatchObject({
        details: { permitidas: [LIMPIEZA_PENDIENTE] },
      });
    });

    it('responde 409 si otra petición cambió la mesa antes de escribir (concurrencia)', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: OCUPADA }));
      repositorio.transicionarEstado.mockResolvedValue(false);

      const error = await capturar(
        servicio.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE }),
      );

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.TRANSICION_INVALIDA });
    });
  });

  describe('RN-15 · mesa en unión → 409 MESA_EN_UNION', () => {
    it('rechaza una transición que sería válida', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: OCUPADA, unionMesaId: UNION_ID }),
      );

      const error = await capturar(
        servicio.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE }),
      );

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_EN_UNION });
      expect(repositorio.transicionarEstado).not.toHaveBeenCalled();
    });

    it('tiene prioridad sobre TRANSICION_INVALIDA', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, unionMesaId: UNION_ID }),
      );

      const error = await capturar(
        servicio.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE }),
      );

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_EN_UNION });
    });
  });

  describe('404 MESA_NO_ENCONTRADA', () => {
    it('si la mesa no existe', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const error = await capturar(servicio.actualizarEstado(MESA_ID, { estado: LIBRE }));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_ENCONTRADA });
    });

    it('si la mesa está inactiva', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ activo: false }));

      const error = await capturar(
        servicio.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE }),
      );

      expect(error.getStatus()).toBe(404);
      expect(repositorio.transicionarEstado).not.toHaveBeenCalled();
    });
  });
});
