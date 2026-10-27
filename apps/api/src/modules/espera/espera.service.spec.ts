import { EstadoEspera } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import type { DomainException } from '../../common/errors/domain.exception';
import type { SalaWebSocketGateway } from '../../gateways/sala.gateway';
import type { EsperaRegistro } from './espera.registro';
import type { EsperaRepository } from './espera.repository';
import { EsperaService } from './espera.service';

const ESPERA_1 = 'e1000000-0000-4000-8000-000000000001';
const ESPERA_2 = 'e1000000-0000-4000-8000-000000000002';
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const AHORA = new Date('2030-01-15T12:00:00.000Z');

function registro(id = ESPERA_1, parcial: Partial<EsperaRegistro> = {}): EsperaRegistro {
  return {
    id,
    nombreCliente: 'Gabriel Torres',
    telefonoContacto: '+52 999 111 2233',
    cantidadPersonas: 2,
    horaLlegada: AHORA,
    estado: EstadoEspera.EN_ESPERA,
    mesaAsignadaId: null,
    ...parcial,
  };
}

function crearRepositorio(): jest.Mocked<EsperaRepository> {
  const repo = {
    enTransaccion: jest.fn((op: (r: EsperaRepository) => Promise<unknown>) => op(repo)),
    crear: jest.fn(),
    listar: jest.fn(),
    buscarPorId: jest.fn(),
    transicionarEstado: jest.fn(),
    bloquearCandidatosEnEspera: jest.fn(),
    marcarNotificado: jest.fn(),
  } as unknown as jest.Mocked<EsperaRepository>;
  return repo;
}

async function capturar(promesa: Promise<unknown>): Promise<DomainException> {
  try {
    await promesa;
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('Se esperaba una excepción');
}

describe('EsperaService (BE-010 · SPEC §5.6, F4, RN-17)', () => {
  let repositorio: jest.Mocked<EsperaRepository>;
  let gateway: jest.Mocked<Pick<SalaWebSocketGateway, 'emitirEsperaMesaDisponible'>>;
  let servicio: EsperaService;

  beforeEach(() => {
    repositorio = crearRepositorio();
    gateway = {
      emitirEsperaMesaDisponible: jest.fn(),
    };
    servicio = new EsperaService(repositorio, gateway as unknown as SalaWebSocketGateway, {
      ahora: () => AHORA,
    });
  });

  describe('crear (RF-021)', () => {
    it('registra al cliente con horaLlegada automática y estado En espera', async () => {
      repositorio.crear.mockResolvedValue(registro());

      const dto = await servicio.crear({
        nombreCliente: 'Gabriel Torres',
        telefonoContacto: '+52 999 111 2233',
        cantidadPersonas: 2,
      });

      expect(repositorio.crear).toHaveBeenCalledWith(
        {
          nombreCliente: 'Gabriel Torres',
          telefonoContacto: '+52 999 111 2233',
          cantidadPersonas: 2,
        },
        AHORA,
      );
      expect(dto).toEqual({
        esperaId: ESPERA_1,
        nombreCliente: 'Gabriel Torres',
        telefonoContacto: '+52 999 111 2233',
        cantidadPersonas: 2,
        horaLlegada: AHORA.toISOString(),
        estado: EstadoEspera.EN_ESPERA,
        idMesaAsignada: null,
      });
    });
  });

  describe('listar (SPEC §5.6)', () => {
    it('lista activos (En espera y Notificado) por defecto ordenados por horaLlegada ASC', async () => {
      const masReciente = registro(ESPERA_2, {
        horaLlegada: new Date('2030-01-15T12:10:00.000Z'),
        estado: EstadoEspera.NOTIFICADO,
        mesaAsignadaId: MESA_ID,
      });
      const masAntiguo = registro(ESPERA_1, {
        horaLlegada: new Date('2030-01-15T12:00:00.000Z'),
        estado: EstadoEspera.EN_ESPERA,
      });
      repositorio.listar.mockResolvedValue([masReciente, masAntiguo]);

      const resultado = await servicio.listar();

      expect(repositorio.listar).toHaveBeenCalledWith([
        EstadoEspera.EN_ESPERA,
        EstadoEspera.NOTIFICADO,
      ]);
      expect(resultado.map((r) => r.esperaId)).toEqual([ESPERA_1, ESPERA_2]);
    });

    it('filtra por estado específico cuando se envía en el query', async () => {
      repositorio.listar.mockResolvedValue([
        registro(ESPERA_1, { estado: EstadoEspera.CANCELADO }),
      ]);

      const resultado = await servicio.listar({ estado: EstadoEspera.CANCELADO });

      expect(repositorio.listar).toHaveBeenCalledWith([EstadoEspera.CANCELADO]);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].estado).toBe(EstadoEspera.CANCELADO);
    });
  });

  describe('actualizarEstado (RF-022, SPEC §4.3)', () => {
    it.each([
      [EstadoEspera.EN_ESPERA, EstadoEspera.SENTADO, null, null],
      [EstadoEspera.EN_ESPERA, EstadoEspera.CANCELADO, null, null],
      [EstadoEspera.NOTIFICADO, EstadoEspera.SENTADO, MESA_ID, MESA_ID],
      [EstadoEspera.NOTIFICADO, EstadoEspera.CANCELADO, MESA_ID, null],
      [EstadoEspera.NOTIFICADO, EstadoEspera.EN_ESPERA, MESA_ID, null],
    ] as const)(
      'transiciona %s → %s actualizando idMesaAsignada (%s → %s)',
      async (desde, hacia, mesaAntes, mesaDespues) => {
        repositorio.buscarPorId.mockResolvedValue(
          registro(ESPERA_1, { estado: desde, mesaAsignadaId: mesaAntes }),
        );
        repositorio.transicionarEstado.mockResolvedValue(
          registro(ESPERA_1, { estado: hacia, mesaAsignadaId: mesaDespues }),
        );

        const resultado = await servicio.actualizarEstado(ESPERA_1, { estado: hacia });

        expect(repositorio.transicionarEstado).toHaveBeenCalledWith(
          ESPERA_1,
          desde,
          hacia,
          mesaDespues,
        );
        expect(resultado.estado).toBe(hacia);
        expect(resultado.idMesaAsignada).toBe(mesaDespues);
      },
    );

    it('lanza 404 ESPERA_NO_ENCONTRADA si el registro no existe', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const error = await capturar(
        servicio.actualizarEstado(ESPERA_1, { estado: EstadoEspera.CANCELADO }),
      );

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.ESPERA_NO_ENCONTRADA });
    });

    it.each([
      [EstadoEspera.SENTADO, EstadoEspera.CANCELADO],
      [EstadoEspera.SENTADO, EstadoEspera.EN_ESPERA],
      [EstadoEspera.CANCELADO, EstadoEspera.SENTADO],
      [EstadoEspera.CANCELADO, EstadoEspera.EN_ESPERA],
      [EstadoEspera.EN_ESPERA, EstadoEspera.EN_ESPERA],
    ] as const)('lanza 409 TRANSICION_INVALIDA al intentar %s → %s', async (desde, hacia) => {
      repositorio.buscarPorId.mockResolvedValue(registro(ESPERA_1, { estado: desde }));

      const error = await capturar(servicio.actualizarEstado(ESPERA_1, { estado: hacia }));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        code: CODIGO_ERROR.TRANSICION_INVALIDA,
        details: { esperaId: ESPERA_1, desde, hacia },
      });
      expect(repositorio.transicionarEstado).not.toHaveBeenCalled();
    });

    it('lanza 409 TRANSICION_INVALIDA si otra petición modificó el registro concurrentemente', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        registro(ESPERA_1, { estado: EstadoEspera.EN_ESPERA }),
      );
      repositorio.transicionarEstado.mockResolvedValue(null);

      const error = await capturar(
        servicio.actualizarEstado(ESPERA_1, { estado: EstadoEspera.CANCELADO }),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.TRANSICION_INVALIDA });
    });
  });

  describe('notificarSiguienteCompatible (RN-17, RF-020, F4)', () => {
    it('T4.3 · selecciona el cliente compatible más antiguo en FIFO, lo marca Notificado y emite espera.mesa_disponible por WebSocket', async () => {
      const clienteTarde = registro(ESPERA_2, {
        nombreCliente: 'Cliente Tarde',
        cantidadPersonas: 2,
        horaLlegada: new Date('2030-01-15T12:15:00.000Z'),
      });
      const clientePrimero = registro(ESPERA_1, {
        nombreCliente: 'Gabriel Torres',
        cantidadPersonas: 4,
        horaLlegada: new Date('2030-01-15T12:00:00.000Z'),
      });
      repositorio.bloquearCandidatosEnEspera.mockResolvedValue([clienteTarde, clientePrimero]);
      repositorio.marcarNotificado.mockResolvedValue({
        ...clientePrimero,
        estado: EstadoEspera.NOTIFICADO,
        mesaAsignadaId: MESA_ID,
      });

      const resultado = await servicio.notificarSiguienteCompatible(MESA_ID, 4);

      expect(repositorio.bloquearCandidatosEnEspera).toHaveBeenCalledWith(4);
      expect(repositorio.marcarNotificado).toHaveBeenCalledWith(ESPERA_1, MESA_ID);
      expect(gateway.emitirEsperaMesaDisponible).toHaveBeenCalledWith({
        mesaId: MESA_ID,
        esperaId: ESPERA_1,
        cliente: {
          nombre: 'Gabriel Torres',
          cantidadPersonas: 4,
        },
      });
      expect(resultado).toMatchObject({
        esperaId: ESPERA_1,
        estado: EstadoEspera.NOTIFICADO,
        idMesaAsignada: MESA_ID,
      });
    });

    it('no emite evento WebSocket ni modifica nada si no hay clientes compatibles o si marcarNotificado retorna null', async () => {
      repositorio.bloquearCandidatosEnEspera.mockResolvedValueOnce([]);
      await expect(servicio.notificarSiguienteCompatible(MESA_ID, 4)).resolves.toBeNull();
      expect(gateway.emitirEsperaMesaDisponible).not.toHaveBeenCalled();

      const servicioSinGateway = new EsperaService(repositorio);
      repositorio.bloquearCandidatosEnEspera.mockResolvedValueOnce([registro()]);
      repositorio.marcarNotificado.mockResolvedValueOnce(null);
      await expect(servicioSinGateway.notificarSiguienteCompatible(MESA_ID, 4)).resolves.toBeNull();
    });
  });
});
