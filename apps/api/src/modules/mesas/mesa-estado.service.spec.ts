import {
  EstadoMesa,
  EVENT_TOPICS,
  type DiningSessionIniciadaPayload,
  type MesaEstadoActualizadoPayload,
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
const RESERVA_ID = 'b1000000-0000-4000-8000-000000000002';
const ESPERA_ID = 'e1000000-0000-4000-8000-000000000003';
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
    buscarReservaProxima: jest.fn().mockResolvedValue(null),
    tieneReservaProxima: jest.fn().mockResolvedValue(false),
    completarReservaEnOcupacion: jest.fn().mockResolvedValue('OK'),
    sentarEsperaEnOcupacion: jest.fn().mockResolvedValue('OK'),
    registrarAsignacionEnOcupacion: jest.fn().mockResolvedValue(undefined),
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

  describe('Lógica de validación (HTTP 400 / 409)', () => {
    it('BLOQ-02: rechaza con 400 VALIDACION si se envían simultáneamente reservaId y esperaId', async () => {
      const error = await capturar(
        servicio.ocupar(
          MESA_ID,
          { comensales: 2, reservaId: RESERVA_ID, esperaId: ESPERA_ID },
          MESERO_ID,
        ),
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        statusCode: 400,
        code: CODIGO_ERROR.VALIDACION,
        details: { reservaId: RESERVA_ID, esperaId: ESPERA_ID },
      });
      expect(repositorio.enTransaccion).not.toHaveBeenCalled();
    });

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

    it('RN-05 / IMP-02: lanza 409 RESERVA_PROXIMA_PRESENTE con details de la reserva en conflicto cuando forzarOcupacion no es true', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.buscarReservaProxima.mockResolvedValue({
        reservaId: RESERVA_ID,
        nombreContacto: 'Ana López',
        horaInicio: '12:15',
        cantidadPersonas: 4,
      });

      const errorUndefined = await capturar(servicio.ocupar(MESA_ID, { comensales: 4 }, MESERO_ID));
      const errorFalse = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 4, forzarOcupacion: false }, MESERO_ID),
      );

      expect(errorUndefined.getStatus()).toBe(409);
      expect(errorUndefined.getResponse()).toMatchObject({
        statusCode: 409,
        code: CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
        details: {
          mesaId: MESA_ID,
          reservaId: RESERVA_ID,
          nombreContacto: 'Ana López',
          horaInicio: '12:15',
          cantidadPersonas: 4,
        },
      });

      expect(errorFalse.getStatus()).toBe(409);
      expect(errorFalse.getResponse()).toMatchObject({
        statusCode: 409,
        code: CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
        details: {
          mesaId: MESA_ID,
          reservaId: RESERVA_ID,
        },
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

    it('BLOQ-02: lanza 404 o 409 cuando reservaId o esperaId no existen o están en estado inválido', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );

      repositorio.completarReservaEnOcupacion.mockResolvedValueOnce('NO_EXISTE');
      const errRes404 = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 2, reservaId: RESERVA_ID }, MESERO_ID),
      );
      expect(errRes404.getStatus()).toBe(404);
      expect(errRes404.getResponse()).toMatchObject({ code: CODIGO_ERROR.RESERVA_NO_ENCONTRADA });

      repositorio.completarReservaEnOcupacion.mockResolvedValueOnce('INVALIDA');
      const errRes409 = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 2, reservaId: RESERVA_ID }, MESERO_ID),
      );
      expect(errRes409.getStatus()).toBe(409);
      expect(errRes409.getResponse()).toMatchObject({ code: CODIGO_ERROR.TRANSICION_INVALIDA });

      repositorio.sentarEsperaEnOcupacion.mockResolvedValueOnce('NO_EXISTE');
      const errEsp404 = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 2, esperaId: ESPERA_ID }, MESERO_ID),
      );
      expect(errEsp404.getStatus()).toBe(404);
      expect(errEsp404.getResponse()).toMatchObject({ code: CODIGO_ERROR.ESPERA_NO_ENCONTRADA });

      repositorio.sentarEsperaEnOcupacion.mockResolvedValueOnce('INVALIDA');
      const errEsp409 = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 2, esperaId: ESPERA_ID }, MESERO_ID),
      );
      expect(errEsp409.getStatus()).toBe(409);
      expect(errEsp409.getResponse()).toMatchObject({ code: CODIGO_ERROR.TRANSICION_INVALIDA });
    });
  });

  describe('Ejecución transaccional, estado Ocupada, AsignacionMesero y persistencia Outbox (BLOQ-01, BLOQ-03, BLOQ-04, IMP-01)', () => {
    it('actualiza la mesa a Ocupada, registra AsignacionMesero y encola ambos eventos con payload de dominio puro', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.buscarReservaProxima.mockResolvedValue(null);

      const resultado = await servicio.ocupar(
        MESA_ID,
        { comensales: 3, reservaId: RESERVA_ID },
        { userId: MESERO_ID },
        'corr-006',
      );

      expect(resultado).toEqual({
        mesaId: MESA_ID,
        estado: OCUPADA,
        sessionId: expect.stringMatching(PATRON_UUID_V4),
      });

      expect(repositorio.enTransaccion).toHaveBeenCalledTimes(1);
      expect(repositorio.buscarReservaProxima).toHaveBeenCalledWith(
        MESA_ID,
        ahora,
        new Date(ahora.getTime() + 30 * 60_000),
        RESERVA_ID,
      );
      expect(repositorio.completarReservaEnOcupacion).toHaveBeenCalledWith(RESERVA_ID, MESA_ID);
      expect(repositorio.ocuparMesa).toHaveBeenCalledWith(MESA_ID, ahora);
      expect(repositorio.registrarAsignacionEnOcupacion).toHaveBeenCalledWith(
        MESA_ID,
        MESERO_ID,
        ahora,
      );
      expect(enqueueMock).toHaveBeenCalledTimes(2);

      const [txArg1, outboxDining] = enqueueMock.mock.calls[0] as [
        unknown,
        {
          routingKey: string;
          correlationId: string;
          payload: DiningSessionIniciadaPayload;
        },
      ];
      expect(txArg1).toBe(txMock);
      expect(outboxDining.routingKey).toBe(EVENT_TOPICS.DINING_SESSION_INICIADA);
      expect(outboxDining.correlationId).toBe('corr-006');
      expect(outboxDining.payload).toEqual({
        sessionId: resultado.sessionId,
        mesaId: MESA_ID,
        unionId: null,
        meseroId: MESERO_ID,
        comensales: 3,
        numComensales: 3,
        timestamp: ahora.toISOString(),
      });

      const [txArg2, outboxEstado] = enqueueMock.mock.calls[1] as [
        unknown,
        {
          routingKey: string;
          correlationId: string;
          payload: MesaEstadoActualizadoPayload;
        },
      ];
      expect(txArg2).toBe(txMock);
      expect(outboxEstado.routingKey).toBe(EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO);
      expect(outboxEstado.correlationId).toBe('corr-006');
      expect(outboxEstado.payload).toEqual({
        mesaId: MESA_ID,
        estado: OCUPADA,
        unionId: null,
        timestamp: ahora.toISOString(),
      });
    });

    it('BLOQ-03: devuelve advertencias cuando se envían forzarSobrecupo: true y forzarOcupacion: true, y transiciona esperaId a Sentado', async () => {
      repositorio.buscarPorId.mockResolvedValue(
        mesa({ estadoFisico: LIBRE, capacidad: 4, ocupadaDesde: null }),
      );
      repositorio.buscarReservaProxima.mockResolvedValue({
        reservaId: RESERVA_ID,
        nombreContacto: 'Carlos Ruiz',
        horaInicio: '12:20',
        cantidadPersonas: 4,
      });

      const resultado = await servicio.ocupar(
        MESA_ID,
        { comensales: 6, esperaId: ESPERA_ID, forzarSobrecupo: true, forzarOcupacion: true },
        MESERO_ID,
      );

      expect(resultado).toEqual({
        mesaId: MESA_ID,
        estado: OCUPADA,
        sessionId: expect.stringMatching(PATRON_UUID_V4),
        advertencias: [
          expect.stringMatching(/Sobrecupo forzado/i),
          expect.stringMatching(/Ocupación forzada con reserva próxima/i),
        ],
      });
      expect(repositorio.sentarEsperaEnOcupacion).toHaveBeenCalledWith(ESPERA_ID, MESA_ID);
      expect(repositorio.ocuparMesa).toHaveBeenCalledWith(MESA_ID, ahora);
      expect(enqueueMock).toHaveBeenCalledTimes(2);
    });

    it('persiste ambos eventos directamente en tx.outboxEvento.create cuando OutboxService no está inyectado', async () => {
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
      expect(txOutboxCreate).toHaveBeenCalledTimes(2);
      expect(txOutboxCreate).toHaveBeenNthCalledWith(1, {
        data: {
          routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
          correlationId: 'corr-tx-directo',
          intentos: 0,
          payload: {
            sessionId: resultado.sessionId,
            mesaId: MESA_ID,
            unionId: null,
            meseroId: MESERO_ID,
            comensales: 2,
            numComensales: 2,
            timestamp: ahora.toISOString(),
          },
        },
      });
      expect(txOutboxCreate).toHaveBeenNthCalledWith(2, {
        data: {
          routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
          correlationId: 'corr-tx-directo',
          intentos: 0,
          payload: {
            mesaId: MESA_ID,
            estado: OCUPADA,
            unionId: null,
            timestamp: ahora.toISOString(),
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

    it('evalúa reserva próxima desde flag booleano en el registro de mesa o mediante tieneReservaProxima / reservasConfirmadasEntre y fallbacks', async () => {
      // 1. Flag booleano directo en mesa
      repositorio.buscarPorId.mockResolvedValueOnce(
        mesa({ estadoFisico: LIBRE, capacidad: 4, tieneReservaProxima: true }),
      );
      const errReservaFlag = await capturar(
        servicio.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID, '   '),
      );
      expect(errReservaFlag.getStatus()).toBe(409);
      expect(errReservaFlag.getResponse()).toMatchObject({
        code: CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
      });

      // 2. Fallback a tieneReservaProxima cuando buscarReservaProxima no está definido
      const repoConTieneReserva = {
        enTransaccion: jest.fn((op: (r: unknown, tx?: unknown) => Promise<unknown>) =>
          op(repoConTieneReserva, undefined),
        ),
        buscarPorId: jest.fn().mockResolvedValue(mesa({ estadoFisico: LIBRE, capacidad: 4 })),
        tieneReservaProxima: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
        ocuparMesa: jest.fn().mockResolvedValue(true),
      } as unknown as jest.Mocked<MesasRepository>;
      const servicioConTiene = new MesaEstadoService(repoConTieneReserva);
      const errTiene = await capturar(
        servicioConTiene.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID),
      );
      expect(errTiene.getStatus()).toBe(409);
      const okTiene = await servicioConTiene.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID);
      expect(okTiene.estado).toBe(OCUPADA);

      // 3. Fallback a reservasConfirmadasEntre
      const repoConReservasEntre = {
        enTransaccion: jest.fn((op: (r: unknown, tx?: unknown) => Promise<unknown>) =>
          op(repoConReservasEntre, undefined),
        ),
        buscarPorId: jest
          .fn()
          .mockResolvedValueOnce(mesa({ estadoFisico: LIBRE, capacidad: 4 }))
          .mockResolvedValueOnce(mesa({ estadoFisico: LIBRE, capacidad: 4 })),
        reservasConfirmadasEntre: jest
          .fn()
          .mockImplementationOnce(async (desde: Date) => [
            { mesaId: MESA_ID, inicio: new Date(desde.getTime() + 10 * 60_000) },
            { mesaId: 'otra-mesa', inicio: new Date(desde.getTime() + 5 * 60_000) },
          ])
          .mockResolvedValueOnce(undefined),
        transicionarEstado: jest.fn().mockResolvedValue(true),
      } as unknown as jest.Mocked<MesasRepository>;

      const servicioSinReloj = new MesaEstadoService(repoConReservasEntre, {
        enqueue: enqueueMock,
      } as unknown as ConstructorParameters<typeof MesaEstadoService>[1]);

      const errReservaEntre = await capturar(
        servicioSinReloj.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID),
      );
      expect(errReservaEntre.getStatus()).toBe(409);

      const okSinReservas = await servicioSinReloj.ocupar(
        MESA_ID,
        { comensales: 2, reservaId: RESERVA_ID },
        MESERO_ID,
        '   ',
      );
      expect(okSinReservas.estado).toBe(OCUPADA);
      expect(repoConReservasEntre.transicionarEstado).toHaveBeenCalledWith(MESA_ID, LIBRE, OCUPADA);

      // 4. Fallback con registrarEventoOutbox cuando no hay métodos opcionales
      const registrarEventoOutbox = jest.fn().mockResolvedValue(undefined);
      const repoMinimo = {
        enTransaccion: jest.fn((op: (r: unknown, tx?: unknown) => Promise<unknown>) =>
          op(repoMinimo, undefined),
        ),
        buscarPorId: jest.fn().mockResolvedValue(mesa({ estadoFisico: LIBRE, capacidad: 4 })),
        registrarEventoOutbox,
      } as unknown as jest.Mocked<MesasRepository>;

      const servicioMinimo = new MesaEstadoService(repoMinimo);
      const resMinimo = await servicioMinimo.ocupar(
        MESA_ID,
        { comensales: 2, esperaId: ESPERA_ID },
        MESERO_ID,
      );
      expect(resMinimo.estado).toBe(OCUPADA);
      expect(registrarEventoOutbox).toHaveBeenCalledTimes(2);

      // 5. Fallback cuando tampoco existe registrarEventoOutbox
      const repoSinOutbox = {
        enTransaccion: jest.fn((op: (r: unknown, tx?: unknown) => Promise<unknown>) =>
          op(repoSinOutbox, undefined),
        ),
        buscarPorId: jest.fn().mockResolvedValue(mesa({ estadoFisico: LIBRE, capacidad: 4 })),
      } as unknown as jest.Mocked<MesasRepository>;
      const servicioSinNada = new MesaEstadoService(repoSinOutbox);
      const resSinNada = await servicioSinNada.ocupar(MESA_ID, { comensales: 2 }, MESERO_ID);
      expect(resSinNada.estado).toBe(OCUPADA);
    });

    it('actualizarEstado usa new Date() cuando no se inyecta Reloj pero sí OutboxService', async () => {
      const txLocal = { outboxEvento: { create: jest.fn() } };
      repositorio.enTransaccion.mockImplementationOnce(
        (operacion: (r: MesasRepository, tx?: unknown) => Promise<unknown>) =>
          operacion(repositorio, txLocal),
      );
      repositorio.buscarPorId.mockResolvedValueOnce(mesa({ estadoFisico: OCUPADA }));
      repositorio.transicionarEstado.mockResolvedValueOnce(true);

      const enqueue = jest.fn().mockResolvedValue(undefined);
      const servicioConOutboxSinReloj = new MesaEstadoService(repositorio, {
        enqueue,
      } as unknown as ConstructorParameters<typeof MesaEstadoService>[1]);

      await servicioConOutboxSinReloj.actualizarEstado(MESA_ID, { estado: LIMPIEZA_PENDIENTE });
      expect(enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
