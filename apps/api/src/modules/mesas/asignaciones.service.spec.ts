import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import type { DomainException } from '../../common/errors/domain.exception';
import type { Reloj } from '../../common/reloj/reloj';
import type { AsignacionRegistro } from './asignacion.registro';
import type { AsignacionesRepository } from './asignaciones.repository';
import { AsignacionesService } from './asignaciones.service';

const INICIO_PREVIO = new Date('2030-01-15T11:00:00.000Z');
const AHORA = new Date('2030-01-15T12:00:00.000Z');
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const OTRA_MESA_ID = 'a1000000-0000-4000-8000-000000000002';
const MESERO_1 = 'b1000000-0000-4000-8000-000000000001';
const MESERO_2 = 'b1000000-0000-4000-8000-000000000002';
const ASIGNACION_PREVIA_ID = 'f1000000-0000-4000-8000-000000000001';
const ASIGNACION_NUEVA_ID = 'f1000000-0000-4000-8000-000000000002';
const UUID_V1_INVALIDO = '11111111-1111-1111-8111-111111111111';

function asignacion(parcial: Partial<AsignacionRegistro> = {}): AsignacionRegistro {
  return {
    id: ASIGNACION_NUEVA_ID,
    mesaId: MESA_ID,
    meseroId: MESERO_1,
    fechaHoraInicio: AHORA,
    fechaHoraFin: null,
    activo: true,
    ...parcial,
  };
}

function crearRepositorio(): jest.Mocked<AsignacionesRepository> {
  const repo = {
    enTransaccion: jest.fn((operacion: (r: AsignacionesRepository) => Promise<unknown>) =>
      operacion(repo),
    ),
    bloquearMesaActiva: jest.fn(),
    buscarActivaPorMesa: jest.fn(),
    cerrar: jest.fn(),
    crear: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<AsignacionesRepository>;
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

describe('AsignacionesService (BE-003 · RF-010, RF-011, RN-16)', () => {
  let repositorio: jest.Mocked<AsignacionesRepository>;
  let servicio: AsignacionesService;

  beforeEach(() => {
    repositorio = crearRepositorio();
    const reloj = { ahora: () => AHORA } as Reloj;
    servicio = new AsignacionesService(repositorio, reloj);
  });

  describe('RF-010 · asignación inicial', () => {
    it('crea una asignación activa cuando la mesa no tenía mesero previo', async () => {
      repositorio.bloquearMesaActiva.mockResolvedValue(true);
      repositorio.buscarActivaPorMesa.mockResolvedValue(null);
      repositorio.crear.mockResolvedValue(asignacion());

      const resultado = await servicio.asignar(MESA_ID, { meseroId: MESERO_1 });

      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(repositorio.cerrar).not.toHaveBeenCalled();
      expect(repositorio.crear).toHaveBeenCalledWith({
        mesaId: MESA_ID,
        meseroId: MESERO_1,
        fechaHoraInicio: AHORA,
      });
      expect(resultado).toEqual({
        asignacionId: ASIGNACION_NUEVA_ID,
        mesaId: MESA_ID,
        meseroId: MESERO_1,
        fechaHoraInicio: AHORA.toISOString(),
        fechaHoraFin: null,
        activo: true,
      });
    });
  });

  describe('RF-011 · RN-16 · reasignación atómica', () => {
    it('cierra la asignación previa (activo=false, fechaHoraFin=ahora) ANTES de crear la nueva en la misma transacción', async () => {
      const ordenLlamadas: string[] = [];
      repositorio.bloquearMesaActiva.mockResolvedValue(true);
      repositorio.buscarActivaPorMesa.mockResolvedValue(
        asignacion({
          id: ASIGNACION_PREVIA_ID,
          meseroId: MESERO_1,
          fechaHoraInicio: INICIO_PREVIO,
        }),
      );
      repositorio.cerrar.mockImplementation(async (id, fechaFin) => {
        ordenLlamadas.push('cerrar');
        return asignacion({
          id,
          meseroId: MESERO_1,
          fechaHoraInicio: INICIO_PREVIO,
          fechaHoraFin: fechaFin,
          activo: false,
        });
      });
      repositorio.crear.mockImplementation(async (datos) => {
        ordenLlamadas.push('crear');
        return asignacion({
          id: ASIGNACION_NUEVA_ID,
          mesaId: datos.mesaId,
          meseroId: datos.meseroId,
          fechaHoraInicio: datos.fechaHoraInicio,
        });
      });

      const resultado = await servicio.asignar(MESA_ID, { meseroId: MESERO_2 });

      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(ordenLlamadas).toEqual(['cerrar', 'crear']);
      expect(repositorio.cerrar).toHaveBeenCalledWith(ASIGNACION_PREVIA_ID, AHORA);
      expect(repositorio.crear).toHaveBeenCalledWith({
        mesaId: MESA_ID,
        meseroId: MESERO_2,
        fechaHoraInicio: AHORA,
      });
      expect(resultado.meseroId).toBe(MESERO_2);
      expect(resultado.activo).toBe(true);
      expect(resultado.fechaHoraFin).toBeNull();
    });

    it('garantiza fechaHoraFin > fechaHoraInicio si la reasignación ocurre en el mismo instante que el inicio previo', async () => {
      repositorio.bloquearMesaActiva.mockResolvedValue(true);
      repositorio.buscarActivaPorMesa.mockResolvedValue(
        asignacion({
          id: ASIGNACION_PREVIA_ID,
          meseroId: MESERO_1,
          fechaHoraInicio: AHORA,
        }),
      );
      const instanteEsperado = new Date(AHORA.getTime() + 1);
      repositorio.cerrar.mockResolvedValue(
        asignacion({
          id: ASIGNACION_PREVIA_ID,
          fechaHoraInicio: AHORA,
          fechaHoraFin: instanteEsperado,
          activo: false,
        }),
      );
      repositorio.crear.mockResolvedValue(
        asignacion({
          id: ASIGNACION_NUEVA_ID,
          meseroId: MESERO_2,
          fechaHoraInicio: instanteEsperado,
        }),
      );

      await servicio.asignar(MESA_ID, { meseroId: MESERO_2 });

      expect(repositorio.cerrar).toHaveBeenCalledWith(ASIGNACION_PREVIA_ID, instanteEsperado);
      expect(repositorio.crear).toHaveBeenCalledWith({
        mesaId: MESA_ID,
        meseroId: MESERO_2,
        fechaHoraInicio: instanteEsperado,
      });
    });
  });

  describe('404 MESA_NO_ENCONTRADA', () => {
    it('rechaza con 404 cuando la mesa no existe o está inactiva (activo = false)', async () => {
      repositorio.bloquearMesaActiva.mockResolvedValue(false);

      const error = await capturar(servicio.asignar(MESA_ID, { meseroId: MESERO_1 }));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({
        statusCode: 404,
        code: CODIGO_ERROR.MESA_NO_ENCONTRADA,
        details: { mesaId: MESA_ID },
      });
      expect(repositorio.buscarActivaPorMesa).not.toHaveBeenCalled();
      expect(repositorio.crear).not.toHaveBeenCalled();
    });
  });

  describe('400 VALIDACION (SPEC §8)', () => {
    it('rechaza con 400 cuando mesaId no es un UUID válido', async () => {
      const error = await capturar(servicio.asignar('no-es-uuid', { meseroId: MESERO_1 }));

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        statusCode: 400,
        code: CODIGO_ERROR.VALIDACION,
      });
      expect(repositorio.enTransaccion).not.toHaveBeenCalled();
    });

    it.each(['', 'mesero-1', 'no-es-uuid', UUID_V1_INVALIDO])(
      'rechaza con 400 cuando meseroId ("%s") no es un UUID v4 válido',
      async (meseroInvalido) => {
        const error = await capturar(servicio.asignar(MESA_ID, { meseroId: meseroInvalido }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toMatchObject({
          statusCode: 400,
          code: CODIGO_ERROR.VALIDACION,
        });
        expect(repositorio.enTransaccion).not.toHaveBeenCalled();
      },
    );

    it('rechaza en listar con 400 cuando el filtro meseroId no es un UUID v4 válido', async () => {
      const error = await capturar(servicio.listar({ meseroId: UUID_V1_INVALIDO }));

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        statusCode: 400,
        code: CODIGO_ERROR.VALIDACION,
      });
      expect(repositorio.listar).not.toHaveBeenCalled();
    });
  });

  describe('GET /sala/asignaciones · filtrado', () => {
    it('usa activo = true por defecto cuando no se especifica', async () => {
      repositorio.listar.mockResolvedValue([asignacion()]);

      const resultado = await servicio.listar();

      expect(repositorio.listar).toHaveBeenCalledWith({
        meseroId: undefined,
        activo: true,
      });
      expect(resultado).toHaveLength(1);
      expect(resultado[0].activo).toBe(true);
    });

    it('filtra por meseroId y por activo = false e incluye fechaHoraFin en ISO-8601', async () => {
      repositorio.listar.mockResolvedValue([
        asignacion({
          id: ASIGNACION_PREVIA_ID,
          mesaId: OTRA_MESA_ID,
          meseroId: MESERO_1,
          fechaHoraInicio: INICIO_PREVIO,
          fechaHoraFin: AHORA,
          activo: false,
        }),
      ]);

      const resultado = await servicio.listar({ meseroId: MESERO_1, activo: false });

      expect(repositorio.listar).toHaveBeenCalledWith({
        meseroId: MESERO_1,
        activo: false,
      });
      expect(resultado).toEqual([
        {
          asignacionId: ASIGNACION_PREVIA_ID,
          mesaId: OTRA_MESA_ID,
          meseroId: MESERO_1,
          fechaHoraInicio: INICIO_PREVIO.toISOString(),
          fechaHoraFin: AHORA.toISOString(),
          activo: false,
        },
      ]);
    });
  });
});
