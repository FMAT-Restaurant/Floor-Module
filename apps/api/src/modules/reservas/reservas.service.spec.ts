import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EVENT_TOPICS, EstadoMesa, EstadoReserva } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import type { OutboxService } from '../../events/outbox.service';
import type { MesaRegistro } from '../mesas/mesa.registro';
import type { ReservaRegistro } from './reserva.registro';
import type { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const OTRA_MESA_ID = 'a1000000-0000-4000-8000-000000000002';
const RESERVA_ID = 'b1000000-0000-4000-8000-000000000001';

function mesaMock(parcial: Partial<MesaRegistro> = {}): MesaRegistro {
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

function reservaMock(parcial: Partial<ReservaRegistro> = {}): ReservaRegistro {
  return {
    id: RESERVA_ID,
    mesaId: MESA_ID,
    nombreContacto: 'Laura Pérez',
    telefonoContacto: '+52 999 123 4567',
    cantidadPersonas: 4,
    fecha: '2030-01-15',
    horaInicio: '19:00',
    horaFin: '20:30',
    estado: EstadoReserva.CONFIRMADA,
    alertaEmitida: false,
    ...parcial,
  };
}

function crearRepositorioMock(): jest.Mocked<ReservasRepository> {
  const txMock = {
    outboxEvento: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
  } as unknown as Prisma.TransactionClient;
  const repo = {
    enTransaccion: jest.fn(
      (operacion: (r: ReservasRepository, tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operacion(repo, txMock),
    ),
    buscarMesaActiva: jest.fn(),
    buscarPorId: jest.fn(),
    listar: jest.fn(),
    crear: jest.fn(),
    actualizar: jest.fn(),
    actualizarEstado: jest.fn(),
    listarMesasDisponibles: jest.fn(),
    listarParaAlertas: jest.fn(),
    marcarAlertaEmitida: jest.fn(),
  } as unknown as jest.Mocked<ReservasRepository>;
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

describe('ReservasService (BE-007)', () => {
  let repositorio: jest.Mocked<ReservasRepository>;
  let servicio: ReservasService;

  beforeEach(() => {
    repositorio = crearRepositorioMock();
    servicio = new ReservasService(repositorio, {
      ahora: () => new Date('2030-01-15T12:00:00.000Z'),
    });
  });

  describe('POST · crear (RF-012, RN-09, RN-10)', () => {
    const payloadBase = {
      mesaId: MESA_ID,
      fecha: '2030-01-15',
      horaInicio: '19:00',
      duracion: 90,
      cantidadPersonas: 4,
      cliente: { nombre: 'Laura Pérez', tel: '+52 999 123 4567' },
    };

    it('RN-10 · IMP-06: rechaza con 400 VALIDACION cuando se intenta crear o reprogramar una reserva en el pasado', async () => {
      const errCrearPasado = await capturar(
        servicio.crear({
          ...payloadBase,
          fecha: '2030-01-15',
          horaInicio: '11:30',
        }),
      );
      expect(errCrearPasado.getStatus()).toBe(400);
      expect(errCrearPasado.getResponse()).toMatchObject({
        statusCode: 400,
        code: CODIGO_ERROR.VALIDACION,
        message: 'La reserva debe iniciar en el futuro',
        details: { fecha: '2030-01-15', horaInicio: '11:30' },
      });
      expect(repositorio.crear).not.toHaveBeenCalled();

      repositorio.buscarPorId.mockResolvedValue(reservaMock());
      repositorio.buscarMesaActiva.mockResolvedValue(mesaMock({ capacidad: 4 }));

      const errReprogramarPasado = await capturar(
        servicio.actualizar(RESERVA_ID, {
          fecha: '2030-01-15',
          horaInicio: '12:00',
        }),
      );
      expect(errReprogramarPasado.getStatus()).toBe(400);
      expect(errReprogramarPasado.getResponse()).toMatchObject({
        statusCode: 400,
        code: CODIGO_ERROR.VALIDACION,
        message: 'La reserva debe iniciar en el futuro',
        details: { fecha: '2030-01-15', horaInicio: '12:00' },
      });
      expect(repositorio.actualizar).not.toHaveBeenCalled();
    });

    it('crea la reserva si cantidadPersonas > 0 y <= capacidad de la mesa', async () => {
      repositorio.buscarMesaActiva.mockResolvedValue(mesaMock({ capacidad: 4 }));
      repositorio.crear.mockResolvedValue(reservaMock());

      const resultado = await servicio.crear(payloadBase);

      expect(resultado).toEqual({
        reservaId: RESERVA_ID,
        mesaId: MESA_ID,
        estado: EstadoReserva.CONFIRMADA,
      });
      expect(repositorio.crear).toHaveBeenCalledWith({
        mesaId: MESA_ID,
        nombreContacto: 'Laura Pérez',
        telefonoContacto: '+52 999 123 4567',
        cantidadPersonas: 4,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        horaFin: '20:30',
      });
    });

    it('rechaza con 400 VALIDACION si cantidadPersonas <= 0', async () => {
      const error = await capturar(servicio.crear({ ...payloadBase, cantidadPersonas: 0 }));

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.VALIDACION });
      expect(repositorio.crear).not.toHaveBeenCalled();
    });

    it('rechaza con 404 MESA_NO_ENCONTRADA si la mesa no existe o está inactiva', async () => {
      repositorio.buscarMesaActiva.mockResolvedValue(null);

      const error = await capturar(servicio.crear(payloadBase));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_ENCONTRADA });
    });

    it('RN-10 · SPEC §7 T2.3: rechaza con 400 VALIDACION si cantidadPersonas > capacidad de la mesa', async () => {
      repositorio.buscarMesaActiva.mockResolvedValue(mesaMock({ capacidad: 2 }));

      const error = await capturar(servicio.crear({ ...payloadBase, cantidadPersonas: 4 }));

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        code: CODIGO_ERROR.VALIDACION,
        details: { mesaId: MESA_ID, cantidadPersonas: 4, capacidad: 2 },
      });
      expect(repositorio.crear).not.toHaveBeenCalled();
    });

    it('RN-09: traduce violación de exclusión de PostgreSQL a 409 RESERVA_SOLAPADA', async () => {
      repositorio.buscarMesaActiva.mockResolvedValue(mesaMock({ capacidad: 4 }));
      repositorio.crear.mockRejectedValue(
        new Prisma.PrismaClientUnknownRequestError(
          'conflicting key value violates exclusion constraint "reserva_no_solapada_excl"',
          { clientVersion: '6.19.3' },
        ),
      );

      const error = await capturar(servicio.crear(payloadBase));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.RESERVA_SOLAPADA });
    });
  });

  describe('GET · listar, obtener y disponibilidad (RF-015)', () => {
    it('listar devuelve ReservaDto[] y obtener devuelve ReservaDto o 404', async () => {
      repositorio.listar.mockResolvedValue([reservaMock()]);
      repositorio.buscarPorId.mockResolvedValueOnce(reservaMock()).mockResolvedValueOnce(null);

      const lista = await servicio.listar({ fecha: '2030-01-15' });
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ reservaId: RESERVA_ID, horaFin: '20:30' });

      const detalle = await servicio.obtener(RESERVA_ID);
      expect(detalle.reservaId).toBe(RESERVA_ID);

      const noEncontrada = await capturar(servicio.obtener(RESERVA_ID));
      expect(noEncontrada.getStatus()).toBe(404);
      expect(noEncontrada.getResponse()).toMatchObject({
        code: CODIGO_ERROR.RESERVA_NO_ENCONTRADA,
      });
    });

    it('consultarDisponibilidad soporta query estándar (horaInicio, personas) y alias (hora, aforo)', async () => {
      repositorio.listarMesasDisponibles.mockResolvedValue([mesaMock({ capacidad: 6 })]);

      const porEstandar = await servicio.consultarDisponibilidad({
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        personas: 4,
      });
      expect(porEstandar).toHaveLength(1);
      expect(repositorio.listarMesasDisponibles).toHaveBeenCalledWith({
        fecha: '2030-01-15',
        horaInicio: '19:00',
        horaFin: '20:30',
        personas: 4,
      });

      const porAlias = await servicio.consultarDisponibilidad({
        fecha: '2030-01-15',
        hora: '20:00',
        duracion: 60,
        aforo: 3,
      });
      expect(porAlias).toHaveLength(1);
      expect(repositorio.listarMesasDisponibles).toHaveBeenLastCalledWith({
        fecha: '2030-01-15',
        horaInicio: '20:00',
        horaFin: '21:00',
        personas: 3,
      });
    });

    it('consultarDisponibilidad rechaza hora faltante o aforo <= 0 con 400 VALIDACION', async () => {
      const sinHora = await capturar(
        servicio.consultarDisponibilidad({ fecha: '2030-01-15', duracion: 60, personas: 2 }),
      );
      expect(sinHora.getStatus()).toBe(400);

      const aforoCero = await capturar(
        servicio.consultarDisponibilidad({
          fecha: '2030-01-15',
          horaInicio: '19:00',
          duracion: 60,
          personas: 0,
        }),
      );
      expect(aforoCero.getStatus()).toBe(400);
    });
  });

  describe('PATCH / DELETE · reprogramación y cancelación (RF-013, RF-014, RN-11)', () => {
    it('reprograma horario y mesa de una reserva Confirmada', async () => {
      repositorio.buscarPorId.mockResolvedValue(reservaMock());
      repositorio.buscarMesaActiva.mockResolvedValue(mesaMock({ id: OTRA_MESA_ID, capacidad: 6 }));
      repositorio.actualizar.mockResolvedValue(
        reservaMock({
          mesaId: OTRA_MESA_ID,
          horaInicio: '20:00',
          horaFin: '22:00',
          cantidadPersonas: 5,
        }),
      );

      const actualizada = await servicio.actualizar(RESERVA_ID, {
        mesaId: OTRA_MESA_ID,
        horaInicio: '20:00',
        duracion: 120,
        cantidadPersonas: 5,
      });

      expect(actualizada).toMatchObject({
        mesaId: OTRA_MESA_ID,
        horaInicio: '20:00',
        horaFin: '22:00',
        cantidadPersonas: 5,
      });
    });

    it.each([EstadoReserva.COMPLETADA, EstadoReserva.CANCELADA, EstadoReserva.NO_SHOW])(
      'rechaza reprogramar una reserva en estado %s con 409 TRANSICION_INVALIDA',
      async (estadoActual) => {
        repositorio.buscarPorId.mockResolvedValue(reservaMock({ estado: estadoActual }));

        const error = await capturar(
          servicio.actualizar(RESERVA_ID, { horaInicio: '21:00', duracion: 60 }),
        );

        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toMatchObject({
          code: CODIGO_ERROR.TRANSICION_INVALIDA,
          details: { reservaId: RESERVA_ID, estadoActual },
        });
        expect(repositorio.actualizar).not.toHaveBeenCalled();
      },
    );

    it.each([EstadoReserva.COMPLETADA, EstadoReserva.CANCELADA, EstadoReserva.NO_SHOW])(
      'rechaza cancelar una reserva ya en estado %s con 409 TRANSICION_INVALIDA',
      async (estadoActual) => {
        repositorio.buscarPorId.mockResolvedValue(reservaMock({ estado: estadoActual }));

        const error = await capturar(servicio.cancelar(RESERVA_ID));

        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toMatchObject({
          code: CODIGO_ERROR.TRANSICION_INVALIDA,
          details: { reservaId: RESERVA_ID, estadoActual },
        });
        expect(repositorio.actualizarEstado).not.toHaveBeenCalled();
      },
    );

    it('cancela exitosamente una reserva Confirmada', async () => {
      repositorio.buscarPorId.mockResolvedValue(reservaMock());
      repositorio.actualizarEstado.mockResolvedValue(
        reservaMock({ estado: EstadoReserva.CANCELADA }),
      );

      const resultado = await servicio.cancelar(RESERVA_ID);

      expect(resultado.estado).toBe(EstadoReserva.CANCELADA);
    });

    it('responde 404 si se intenta reprogramar o cancelar una reserva inexistente', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const errPatch = await capturar(servicio.actualizar(RESERVA_ID, { cantidadPersonas: 2 }));
      const errCancel = await capturar(servicio.cancelar(RESERVA_ID));

      expect(errPatch.getStatus()).toBe(404);
      expect(errCancel.getStatus()).toBe(404);
    });

    it('valida cantidadPersonas, existencia de mesa destino y capacidad al reprogramar', async () => {
      repositorio.buscarPorId.mockResolvedValue(reservaMock());

      const errCero = await capturar(servicio.actualizar(RESERVA_ID, { cantidadPersonas: 0 }));
      expect(errCero.getStatus()).toBe(400);

      repositorio.buscarMesaActiva.mockResolvedValueOnce(null);
      const errMesaNoExiste = await capturar(
        servicio.actualizar(RESERVA_ID, { mesaId: OTRA_MESA_ID }),
      );
      expect(errMesaNoExiste.getStatus()).toBe(404);

      repositorio.buscarMesaActiva.mockResolvedValueOnce(mesaMock({ capacidad: 2 }));
      const errCapacidad = await capturar(servicio.actualizar(RESERVA_ID, { cantidadPersonas: 4 }));
      expect(errCapacidad.getStatus()).toBe(400);
    });

    it('propaga errores inesperados que no son de dominio ni de Prisma', async () => {
      repositorio.buscarMesaActiva.mockResolvedValue(mesaMock({ capacidad: 4 }));
      repositorio.crear.mockRejectedValue(new Error('Fallo inesperado'));

      await expect(
        servicio.crear({
          mesaId: MESA_ID,
          fecha: '2030-01-15',
          horaInicio: '19:00',
          duracion: 90,
          cantidadPersonas: 2,
          cliente: { nombre: 'Ana', tel: '5512345678' },
        }),
      ).rejects.toThrow('Fallo inesperado');
    });
  });

  describe('POST · marcarComoNoShow (BE-008, RF-017b, RN-11, SPEC §5.4)', () => {
    it('marca una reserva Confirmada como No-show y devuelve ReservaDto (200)', async () => {
      repositorio.buscarPorId.mockResolvedValue(reservaMock());
      repositorio.actualizarEstado.mockResolvedValue(
        reservaMock({ estado: EstadoReserva.NO_SHOW }),
      );

      const resultado = await servicio.marcarComoNoShow(RESERVA_ID);

      expect(resultado.estado).toBe(EstadoReserva.NO_SHOW);
      expect(repositorio.actualizarEstado).toHaveBeenCalledWith(RESERVA_ID, EstadoReserva.NO_SHOW);
    });

    it('responde 404 RESERVA_NO_ENCONTRADA si la reserva no existe', async () => {
      repositorio.buscarPorId.mockResolvedValue(null);

      const error = await capturar(servicio.marcarComoNoShow(RESERVA_ID));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({
        code: CODIGO_ERROR.RESERVA_NO_ENCONTRADA,
      });
      expect(repositorio.actualizarEstado).not.toHaveBeenCalled();
    });

    it.each([EstadoReserva.COMPLETADA, EstadoReserva.CANCELADA, EstadoReserva.NO_SHOW])(
      'rechaza marcar como No-show una reserva en estado %s con 409 TRANSICION_INVALIDA',
      async (estadoActual) => {
        repositorio.buscarPorId.mockResolvedValue(reservaMock({ estado: estadoActual }));

        const error = await capturar(servicio.marcarComoNoShow(RESERVA_ID));

        expect(error.getStatus()).toBe(409);
        expect(error.getResponse()).toMatchObject({
          code: CODIGO_ERROR.TRANSICION_INVALIDA,
          details: { reservaId: RESERVA_ID, estadoActual },
        });
        expect(repositorio.actualizarEstado).not.toHaveBeenCalled();
      },
    );
  });

  describe('BE-008 · procesarAlertasProximas (RF-016, RN-08, RN-20, SPEC §6.1)', () => {
    it('detecta reservas en ventana de 30 minutos con alertaEmitida = false, marca alertaEmitida = true y encola ReservaProximaAlertaPayload en Outbox', async () => {
      const enqueueEvent = jest.fn().mockResolvedValue({ id: 'evt-1' });
      const outboxMock = { enqueueEvent } as unknown as OutboxService;
      const servicioConOutbox = new ReservasService(
        repositorio,
        { ahora: () => new Date('2030-01-15T18:40:00.000Z') },
        outboxMock,
      );

      repositorio.listarParaAlertas.mockResolvedValue([
        reservaMock({
          id: RESERVA_ID,
          mesaId: MESA_ID,
          nombreContacto: 'Laura Pérez',
          fecha: '2030-01-15',
          horaInicio: '19:00',
          horaFin: '20:30',
          estado: EstadoReserva.CONFIRMADA,
          alertaEmitida: false,
        }),
        // Fuera de ventana (> 30 min)
        reservaMock({
          id: 'b1000000-0000-4000-8000-000000000002',
          fecha: '2030-01-15',
          horaInicio: '19:30',
          horaFin: '21:00',
          alertaEmitida: false,
        }),
        // Ya emitida
        reservaMock({
          id: 'b1000000-0000-4000-8000-000000000003',
          fecha: '2030-01-15',
          horaInicio: '18:50',
          horaFin: '20:20',
          alertaEmitida: true,
        }),
      ]);
      repositorio.marcarAlertaEmitida.mockResolvedValue(true);

      const emitidas = await servicioConOutbox.procesarAlertasProximas();

      expect(emitidas).toBe(1);
      expect(repositorio.listarParaAlertas).toHaveBeenCalledWith(
        new Date('2030-01-15T18:40:00.000Z'),
        new Date('2030-01-15T19:10:00.000Z'),
      );
      expect(repositorio.marcarAlertaEmitida).toHaveBeenCalledTimes(1);
      expect(repositorio.marcarAlertaEmitida).toHaveBeenCalledWith(RESERVA_ID);
      expect(enqueueEvent).toHaveBeenCalledTimes(1);
      expect(enqueueEvent).toHaveBeenCalledWith(expect.anything(), {
        routingKey: EVENT_TOPICS.RESERVA_PROXIMA_ALERTA,
        payload: {
          reservaId: RESERVA_ID,
          mesaId: MESA_ID,
          nombreContacto: 'Laura Pérez',
          horaInicio: '19:00',
          minutosRestantes: 20,
          timestamp: '2030-01-15T18:40:00.000Z',
        },
      });
    });

    it('RN-20: no genera alerta duplicada si marcarAlertaEmitida retorna false y continúa ante fallos individuales registrando en Logger', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const enqueueEvent = jest.fn().mockResolvedValue({ id: 'evt-1' });
      const outboxMock = { enqueueEvent } as unknown as OutboxService;
      const servicioConOutbox = new ReservasService(
        repositorio,
        { ahora: () => new Date('2030-01-15T18:45:00.000Z') },
        outboxMock,
      );

      repositorio.listarParaAlertas.mockResolvedValue([
        reservaMock({ id: 'res-ya-emitida', horaInicio: '19:00', alertaEmitida: false }),
        reservaMock({ id: 'res-error', horaInicio: '19:05', alertaEmitida: false }),
      ]);
      repositorio.marcarAlertaEmitida
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error('Fallo transaccional'));

      const emitidas = await servicioConOutbox.procesarAlertasProximas();

      expect(emitidas).toBe(0);
      expect(enqueueEvent).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy.mock.calls[0]?.[0]).toContain('Fallo transaccional');
      loggerSpy.mockRestore();
    });
  });
});
