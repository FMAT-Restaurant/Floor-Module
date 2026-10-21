import { EstadoMesa } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import type { DomainException } from '../../common/errors/domain.exception';
import type { Reloj } from '../../common/reloj/reloj';
import type { MesaRegistro } from './mesa.registro';
import type { MesasRepository } from './mesas.repository';
import { MesasService } from './mesas.service';

const AHORA = new Date('2030-01-15T12:00:00.000Z');
const VENTANA = 30;
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const OTRA_MESA_ID = 'a1000000-0000-4000-8000-000000000002';
const UNION_ID = 'c1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'b1000000-0000-4000-8000-000000000001';

function mesa(parcial: Partial<MesaRegistro> = {}): MesaRegistro {
  return {
    id: MESA_ID,
    numeroMesa: 1,
    capacidad: 4,
    zona: 'Principal',
    estadoFisico: EstadoMesa.LIBRE,
    unionMesaId: null,
    activo: true,
    ocupadaDesde: null,
    ...parcial,
  };
}

function crearRepositorio(): jest.Mocked<MesasRepository> {
  const repo = {
    enTransaccion: jest.fn((operacion: (r: MesasRepository) => Promise<unknown>) =>
      operacion(repo),
    ),
    listar: jest.fn(),
    listarEnVivo: jest.fn(),
    buscarPorId: jest.fn(),
    existeMesaActivaConNumero: jest.fn(),
    crear: jest.fn(),
    actualizar: jest.fn(),
    darDeBaja: jest.fn(),
    contarReservasConfirmadasFuturas: jest.fn(),
    reservasConfirmadasEntre: jest.fn(),
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

describe('MesasService', () => {
  let repositorio: jest.Mocked<MesasRepository>;
  let servicio: MesasService;

  beforeEach(() => {
    repositorio = crearRepositorio();
    const reloj = { ahora: () => AHORA } as Reloj;
    servicio = new MesasService(repositorio, reloj, VENTANA);
  });

  describe('consulta', () => {
    it('listar devuelve DTOs con el estado de @floor/shared', async () => {
      repositorio.listar.mockResolvedValue([mesa({ estadoFisico: EstadoMesa.LIMPIEZA_PENDIENTE })]);

      const resultado = await servicio.listar({ incluirInactivas: false });

      expect(resultado).toEqual([
        {
          mesaId: MESA_ID,
          numeroMesa: 1,
          capacidad: 4,
          zona: 'Principal',
          estadoFisico: 'Limpieza pendiente',
          unionId: null,
          activo: true,
        },
      ]);
    });

    it('obtener responde 404 MESA_NO_ENCONTRADA si no existe', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const error = await capturar(servicio.obtener(MESA_ID));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_ENCONTRADA });
    });

    it('obtener trata una mesa inactiva como inexistente (SPEC §1)', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ activo: false }));

      const error = await capturar(servicio.obtener(MESA_ID));

      expect(error.getStatus()).toBe(404);
    });
  });

  describe('RN-19 · crear', () => {
    it('crea la mesa si el número está libre', async () => {
      repositorio.existeMesaActivaConNumero.mockResolvedValue(false);
      repositorio.crear.mockResolvedValue(mesa({ numeroMesa: 7 }));

      const resultado = await servicio.crear({ numeroMesa: 7, capacidad: 4, zona: 'Principal' });

      expect(resultado.estadoFisico).toBe(EstadoMesa.LIBRE);
      expect(repositorio.crear).toHaveBeenCalledWith({
        numeroMesa: 7,
        capacidad: 4,
        zona: 'Principal',
      });
    });

    it('rechaza con 409 NUMERO_MESA_DUPLICADO y no crea nada', async () => {
      repositorio.existeMesaActivaConNumero.mockResolvedValue(true);

      const error = await capturar(
        servicio.crear({ numeroMesa: 7, capacidad: 4, zona: 'Principal' }),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.NUMERO_MESA_DUPLICADO });
      expect(repositorio.crear).not.toHaveBeenCalled();
    });
  });

  describe('RN-15 · actualizar', () => {
    it('modifica una mesa libre dentro de una transacción', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa());
      repositorio.actualizar.mockResolvedValue(mesa({ capacidad: 6 }));

      const resultado = await servicio.actualizar(MESA_ID, { capacidad: 6 });

      expect(resultado.capacidad).toBe(6);
      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(repositorio.existeMesaActivaConNumero).not.toHaveBeenCalled();
    });

    it('responde 404 si la mesa no existe', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const error = await capturar(servicio.actualizar(MESA_ID, { capacidad: 6 }));

      expect(error.getStatus()).toBe(404);
    });

    it('rechaza una mesa ocupada con 409 MESA_NO_DISPONIBLE', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: EstadoMesa.OCUPADA }));

      const error = await capturar(servicio.actualizar(MESA_ID, { capacidad: 6 }));

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_DISPONIBLE });
      expect(repositorio.actualizar).not.toHaveBeenCalled();
    });

    it('rechaza una mesa en unión con 409 MESA_EN_UNION, aunque además esté ocupada', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: EstadoMesa.OCUPADA, unionMesaId: UNION_ID }),
      );

      const error = await capturar(servicio.actualizar(MESA_ID, { capacidad: 6 }));

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_EN_UNION });
    });

    it('RN-19: rechaza cambiar a un número que ya usa otra mesa activa', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ numeroMesa: 1 }));
      repositorio.existeMesaActivaConNumero.mockResolvedValue(true);

      const error = await capturar(servicio.actualizar(MESA_ID, { numeroMesa: 2 }));

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.NUMERO_MESA_DUPLICADO });
      expect(repositorio.existeMesaActivaConNumero).toHaveBeenCalledWith(2, MESA_ID);
    });

    it('RN-19: conservar el mismo número no cuenta como duplicado', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ numeroMesa: 1 }));
      repositorio.actualizar.mockResolvedValue(mesa({ numeroMesa: 1, zona: 'Bar' }));

      await servicio.actualizar(MESA_ID, { numeroMesa: 1, zona: 'Bar' });

      expect(repositorio.existeMesaActivaConNumero).not.toHaveBeenCalled();
    });
  });

  describe('RN-18 · darDeBaja', () => {
    it('da de baja una mesa libre, sin unión y sin reservas confirmadas dentro de una transacción', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa());
      repositorio.contarReservasConfirmadasFuturas.mockResolvedValue(0);

      await servicio.darDeBaja(MESA_ID);

      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(repositorio.darDeBaja).toHaveBeenCalledWith(MESA_ID);
      expect(repositorio.contarReservasConfirmadasFuturas).toHaveBeenCalledWith(MESA_ID, AHORA);
    });

    it('responde 404 si la mesa no existe', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const error = await capturar(servicio.darDeBaja(OTRA_MESA_ID));

      expect(error.getStatus()).toBe(404);
    });

    it.each([EstadoMesa.OCUPADA, EstadoMesa.LIMPIEZA_PENDIENTE])(
      'rechaza con 409 TRANSICION_INVALIDA si la mesa está %s',
      async (estado) => {
        repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: estado }));

        const error = await capturar(servicio.darDeBaja(MESA_ID));

        expect(error.getResponse()).toMatchObject({
          code: CODIGO_ERROR.TRANSICION_INVALIDA,
          details: { motivo: 'MESA_NO_LIBRE' },
        });
        expect(repositorio.darDeBaja).not.toHaveBeenCalled();
      },
    );

    it('rechaza con 409 MESA_EN_UNION si pertenece a una unión', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa({ unionMesaId: UNION_ID }));

      const error = await capturar(servicio.darDeBaja(MESA_ID));

      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_EN_UNION });
    });

    it('rechaza con 409 TRANSICION_INVALIDA si tiene reservas confirmadas pendientes', async () => {
      repositorio.buscarPorId.mockResolvedValue(mesa());
      repositorio.contarReservasConfirmadasFuturas.mockResolvedValue(2);

      const error = await capturar(servicio.darDeBaja(MESA_ID));

      expect(error.getResponse()).toMatchObject({
        code: CODIGO_ERROR.TRANSICION_INVALIDA,
        details: { motivo: 'RESERVAS_CONFIRMADAS', reservas: 2 },
      });
      expect(repositorio.darDeBaja).not.toHaveBeenCalled();
    });
  });

  describe('RN-08 · estado en vivo', () => {
    const minutos = (n: number) => new Date(AHORA.getTime() + n * 60_000);

    it('consulta la ventana [ahora, ahora + V] y marca tieneReservaProxima por mesa', async () => {
      repositorio.listarEnVivo.mockResolvedValue([
        { ...mesa({ id: MESA_ID }), meseroId: null },
        { ...mesa({ id: OTRA_MESA_ID, numeroMesa: 2 }), meseroId: null },
      ]);
      repositorio.reservasConfirmadasEntre.mockResolvedValue([
        { mesaId: MESA_ID, inicio: minutos(10) },
      ]);

      const resultado = await servicio.listarEnVivo();

      expect(repositorio.reservasConfirmadasEntre).toHaveBeenCalledWith(AHORA, minutos(VENTANA));
      expect(resultado.map((m) => m.tieneReservaProxima)).toEqual([true, false]);
    });

    it('incluye ocupadaDesde en ISO-8601 UTC y el mesero asignado', async () => {
      const desde = new Date('2030-01-15T11:15:00.000Z');
      repositorio.listarEnVivo.mockResolvedValue([
        {
          ...mesa({ estadoFisico: EstadoMesa.OCUPADA, ocupadaDesde: desde }),
          meseroId: MESERO_ID,
        },
        { ...mesa({ id: OTRA_MESA_ID, numeroMesa: 2 }), meseroId: null },
      ]);
      repositorio.reservasConfirmadasEntre.mockResolvedValue([]);

      const [ocupada, libre] = await servicio.listarEnVivo();

      expect(ocupada).toMatchObject({
        ocupadaDesde: '2030-01-15T11:15:00.000Z',
        meseroId: MESERO_ID,
        tieneReservaProxima: false,
      });
      expect(libre).toMatchObject({ ocupadaDesde: null, meseroId: null });
    });
  });
});
