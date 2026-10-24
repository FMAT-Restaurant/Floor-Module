import {
  EstadoMesa,
  EVENT_TOPICS,
  type DiningSessionIniciadaPayload,
  type EventEnvelope,
} from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import type { DomainException } from '../../common/errors/domain.exception';
import type { MesaRegistro } from './mesa.registro';
import { MesaEstadoService } from './mesa-estado.service';
import type { MesasRepository } from './mesas.repository';

const { LIBRE, OCUPADA, LIMPIEZA_PENDIENTE } = EstadoMesa;
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const UNION_ID = 'c1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'd1000000-0000-4000-8000-000000000001';
const PATRON_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    enTransaccion: jest.fn((operacion: (r: MesasRepository, tx?: unknown) => Promise<unknown>) =>
      operacion(repo),
    ),
    buscarPorId: jest.fn(),
    transicionarEstado: jest.fn(),
    ocuparMesa: jest.fn().mockResolvedValue(true),
    tieneReservaProxima: jest.fn().mockResolvedValue(false),
    registrarEventoOutbox: jest.fn().mockResolvedValue(undefined),
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

    it('RF-008: encola sala.mesa.estado_actualizado en Outbox dentro de la transacción cuando OutboxService está inyectado', async () => {
      const txMock = { outboxEvento: { create: jest.fn() } };
      repositorio.enTransaccion.mockImplementationOnce(
        (operacion: (r: MesasRepository, tx?: unknown) => Promise<unknown>) =>
          operacion(repositorio, txMock),
      );
      repositorio.buscarPorId.mockResolvedValue(mesa({ estadoFisico: OCUPADA }));
      repositorio.transicionarEstado.mockResolvedValue(true);

      const enqueue = jest.fn().mockResolvedValue(undefined);
      const ahora = new Date('2030-01-15T12:00:00.000Z');
      const conOutbox = new MesaEstadoService(
        repositorio,
        { enqueue } as unknown as ConstructorParameters<typeof MesaEstadoService>[1],
        { ahora: () => ahora },
      );

      await conOutbox.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE }, 'corr-123');

      expect(enqueue).toHaveBeenCalledWith(txMock, {
        routingKey: 'sala.mesa.estado_actualizado',
        payload: {
          mesaId: MESA_ID,
          estado: LIMPIEZA_PENDIENTE,
          unionId: null,
          timestamp: ahora.toISOString(),
        },
        correlationId: 'corr-123',
      });
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

describe('MesaEstadoService · ocupar mesa y dining session (BE-006 · SPEC §5.2, F1)', () => {
  let repositorio: jest.Mocked<MesasRepository>;
  let txOutboxCreate: jest.Mock;
  let txMock: { outboxEvento: { create: jest.Mock } };
  let enqueueMock: jest.Mock;
  let servicio: MesaEstadoService;
  const ahora = new Date('2030-01-15T12:00:00.000Z');

  beforeEach(() => {
    repositorio = crearRepositorio();
    txOutboxCreate = jest.fn().mockResolvedValue(undefined);
    txMock = { outboxEvento: { create: txOutboxCreate } };
    enqueueMock = jest.fn().mockImplementation(async (_tx: unknown, evento: unknown) => {
      await txOutboxCreate({ data: evento });
    });

    repositorio.enTransaccion.mockImplementation(
      (operacion: (r: MesasRepository, tx?: unknown) => Promise<unknown>) =>
        operacion(repositorio, txMock),
    );

    servicio = new MesaEstadoService(
      repositorio,
      { enqueue: enqueueMock } as unknown as ConstructorParameters<typeof MesaEstadoService>[1],
      { ahora: () => ahora },
    );
  });

  describe('Lógica de validación (HTTP 409)', () => {
    it('RN-02: lanza 409 SOBRECUPO_DETECTADO si comensales supera la capacidad y forzarSobrecupo es undefined o false', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );

      const errorUndefined = await capturar(servicio.ocupar(MESA_ID, { comensales: 6 }, MESERO_ID));
      const errorFalse = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 5, forzarSobrecupo: false }, MESERO_ID),
      );

      expect(errorUndefined.getStatus()).toBe(409);
      expect(errorUndefined.getResponse()).toMatchObject({
        statusCode: 409,
        code: CODIGO_ERROR.SOBRECUPO_DETECTADO,
        details: { mesaId: MESA_ID, comensales: 6, capacidad: 4 },
      });

      expect(errorFalse.getStatus()).toBe(409);
      expect(errorFalse.getResponse()).toMatchObject({
        statusCode: 409,
        code: CODIGO_ERROR.SOBRECUPO_DETECTADO,
        details: { mesaId: MESA_ID, comensales: 5, capacidad: 4 },
      });

      expect(repositorio.ocuparMesa).not.toHaveBeenCalled();
      expect(enqueueMock).not.toHaveBeenCalled();
      expect(txOutboxCreate).not.toHaveBeenCalled();
    });

    it('RN-05: lanza 409 RESERVA_PROXIMA_PRESENTE si la mesa tiene reserva en los próximos 30 min y forzarOcupacion es undefined o false', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.tieneReservaProxima.mockResolvedValue(true);

      const errorUndefined = await capturar(servicio.ocupar(MESA_ID, { comensales: 4 }, MESERO_ID));
      const errorFalse = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 4, forzarOcupacion: false }, MESERO_ID),
      );

      expect(errorUndefined.getStatus()).toBe(409);
      expect(errorUndefined.getResponse()).toMatchObject({
        statusCode: 409,
        code: CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
        details: { mesaId: MESA_ID },
      });

      expect(errorFalse.getStatus()).toBe(409);
      expect(errorFalse.getResponse()).toMatchObject({
        statusCode: 409,
        code: CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
        details: { mesaId: MESA_ID },
      });

      expect(repositorio.ocuparMesa).not.toHaveBeenCalled();
      expect(enqueueMock).not.toHaveBeenCalled();
      expect(txOutboxCreate).not.toHaveBeenCalled();
    });

    it('RN-01 / RN-15: lanza 409 MESA_NO_DISPONIBLE si no está Libre, 409 MESA_EN_UNION si está en unión y 404 si no existe', async () => {
      repositorio.buscarPorId.mockResolvedValueOnce(mesa({ estadoFisico: OCUPADA }));
      const errOcupada = await capturar(servicio.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID));
      expect(errOcupada.getStatus()).toBe(409);
      expect(errOcupada.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_DISPONIBLE });

      repositorio.buscarPorId.mockResolvedValueOnce(
        mesa({ estadoFisico: LIBRE, unionMesaId: UNION_ID }),
      );
      const errUnion = await capturar(servicio.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID));
      expect(errUnion.getStatus()).toBe(409);
      expect(errUnion.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_EN_UNION });

      repositorio.buscarPorId.mockResolvedValueOnce(null);
      const errNoExiste = await capturar(servicio.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID));
      expect(errNoExiste.getStatus()).toBe(404);
      expect(errNoExiste.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_ENCONTRADA });
    });
  });

  describe('Ejecución transaccional, estado Ocupada y persistencia Outbox (EventEnvelope)', () => {
    it('actualiza la mesa a Ocupada, genera sessionId UUID v4 y registra sala.dining_session.iniciada con EventEnvelope y numComensales', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.tieneReservaProxima.mockResolvedValue(false);

      const resultado = await servicio.ocupar(
        MESA_ID,
        { comensales: 3 },
        { id: MESERO_ID },
        'corr-006',
      );

      expect(resultado.mesaId).toBe(MESA_ID);
      expect(resultado.estado).toBe(OCUPADA);
      expect(resultado.sessionId).toMatch(PATRON_UUID_V4);

      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(repositorio.ocuparMesa).toHaveBeenCalledWith(MESA_ID, ahora);
      expect(enqueueMock).toHaveBeenCalledTimes(1);

      const [txArg, outboxEvent] = enqueueMock.mock.calls[0] as [
        unknown,
        {
          routingKey: string;
          correlationId: string;
          payload: EventEnvelope<DiningSessionIniciadaPayload>;
        },
      ];

      expect(txArg).toBe(txMock);
      expect(outboxEvent.routingKey).toBe(EVENT_TOPICS.DINING_SESSION_INICIADA);
      expect(outboxEvent.correlationId).toBe('corr-006');

      const envelope = outboxEvent.payload;
      expect(envelope.eventId).toMatch(PATRON_UUID_V4);
      expect(envelope.eventType).toBe(EVENT_TOPICS.DINING_SESSION_INICIADA);
      expect(envelope.timestamp).toBe(ahora.toISOString());
      expect(envelope.correlationId).toBe('corr-006');
      expect(envelope.data).toEqual({
        sessionId: resultado.sessionId,
        mesaId: MESA_ID,
        unionId: null,
        meseroId: MESERO_ID,
        comensales: 3,
        numComensales: 3,
        timestamp: ahora.toISOString(),
      });
    });

    it('permite la ocupación cuando se envían forzarSobrecupo: true y forzarOcupacion: true', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.tieneReservaProxima.mockResolvedValue(true);

      const resultado = await servicio.ocupar(
        MESA_ID,
        { comensales: 6, forzarSobrecupo: true, forzarOcupacion: true },
        MESERO_ID,
      );

      expect(resultado).toEqual({
        mesaId: MESA_ID,
        estado: OCUPADA,
        sessionId: expect.stringMatching(PATRON_UUID_V4),
      });
      expect(repositorio.ocuparMesa).toHaveBeenCalledWith(MESA_ID, ahora);
      expect(enqueueMock).toHaveBeenCalledTimes(1);

      const envelope = enqueueMock.mock.calls[0][1]
        .payload as EventEnvelope<DiningSessionIniciadaPayload>;
      expect(envelope.data.comensales).toBe(6);
      expect(envelope.data.numComensales).toBe(6);
      expect(envelope.data.meseroId).toBe(MESERO_ID);
    });

    it('persiste directamente en tx.outboxEvento.create dentro de la transacción cuando OutboxService no está inyectado', async () => {
      const servicioSinOutbox = new MesaEstadoService(repositorio, undefined, {
        ahora: () => ahora,
      });
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );

      const resultado = await servicioSinOutbox.ocuparMesa(
        MESA_ID,
        { comensales: 2 },
        MESERO_ID,
        'corr-tx-directo',
      );

      expect(resultado.estado).toBe(OCUPADA);
      expect(txOutboxCreate).toHaveBeenCalledTimes(1);
      expect(txOutboxCreate).toHaveBeenCalledWith({
        data: {
          routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
          correlationId: 'corr-tx-directo',
          intentos: 0,
          payload: {
            eventId: expect.stringMatching(PATRON_UUID_V4),
            eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
            timestamp: ahora.toISOString(),
            correlationId: 'corr-tx-directo',
            data: {
              sessionId: resultado.sessionId,
              mesaId: MESA_ID,
              unionId: null,
              meseroId: MESERO_ID,
              comensales: 2,
              numComensales: 2,
              timestamp: ahora.toISOString(),
            },
          },
        },
      });
    });

    it('responde 409 MESA_NO_DISPONIBLE si otra petición ocupó la mesa de forma concurrente', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.ocuparMesa.mockResolvedValueOnce(false);

      const error = await capturar(servicio.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: CODIGO_ERROR.MESA_NO_DISPONIBLE });
      expect(enqueueMock).not.toHaveBeenCalled();
    });
  });
});
