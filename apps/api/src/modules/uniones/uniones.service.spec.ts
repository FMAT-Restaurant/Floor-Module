import { EstadoMesa, EstadoUnion, EVENT_TOPICS } from '@floor/shared';
import type { Prisma } from '@prisma/client';
import type { DomainException } from '../../common/errors/domain.exception';
import type { Reloj } from '../../common/reloj/reloj';
import type { OutboxService } from '../../events/outbox.service';
import type { MesaCandidataRegistro, ReservaProximaEnUnion } from './union.registro';
import type { UnionesRepository } from './uniones.repository';
import { UnionesService } from './uniones.service';

const MESA_1 = 'a1000000-0000-4000-8000-000000000001';
const MESA_2 = 'a1000000-0000-4000-8000-000000000002';
const UNION_ID = 'c1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'e1000000-0000-4000-8000-000000000001';
const AHORA = new Date('2030-01-15T12:00:00.000Z');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TX = { marca: 'tx' } as unknown as Prisma.TransactionClient;

function mesa(id: string, datos: Partial<MesaCandidataRegistro> = {}): MesaCandidataRegistro {
  return {
    id,
    numeroMesa: 1,
    capacidad: 4,
    zona: 'Terraza',
    estadoFisico: EstadoMesa.LIBRE,
    unionMesaId: null,
    activo: true,
    ...datos,
  };
}

function crearRepo() {
  const repo = {
    bloquearMesas: jest.fn().mockResolvedValue([mesa(MESA_1), mesa(MESA_2)]),
    buscarReservaProxima: jest.fn().mockResolvedValue(null),
    crearUnion: jest.fn().mockResolvedValue(UNION_ID),
    ocuparMesasEnUnion: jest.fn().mockResolvedValue(2),
    asignarMesero: jest.fn().mockResolvedValue(undefined),
    bloquearUnion: jest.fn().mockResolvedValue({ id: UNION_ID, estado: EstadoUnion.ACTIVA }),
    bloquearMesasDeUnion: jest.fn().mockResolvedValue([MESA_1, MESA_2]),
    liberarMesasDeUnion: jest.fn().mockResolvedValue(2),
    disolverUnion: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([]),
  };
  const enTransaccion = jest.fn(
    (operacion: (r: typeof repo, tx: Prisma.TransactionClient) => Promise<unknown>) =>
      operacion(repo, TX),
  );
  return { repo, raiz: { ...repo, enTransaccion } };
}

function crearServicio() {
  const { repo, raiz } = crearRepo();
  const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
  const reloj = { ahora: () => AHORA };
  const servicio = new UnionesService(
    raiz as unknown as UnionesRepository,
    outbox as unknown as OutboxService,
    reloj as Reloj,
    30,
  );
  return { servicio, repo, raiz, outbox };
}

const CUERPO = { mesasIds: [MESA_1, MESA_2], totalPersonas: 6, meseroId: MESERO_ID };

async function capturar(promesa: Promise<unknown>) {
  try {
    await promesa;
  } catch (error) {
    const excepcion = error as DomainException;
    const cuerpo = excepcion.getResponse() as { code: string; details: unknown };
    return { status: excepcion.getStatus(), code: cuerpo.code, details: cuerpo.details };
  }
  throw new Error('Se esperaba una excepción');
}

describe('UnionesService.crear (BE-009 · F3 · RN-12, RN-13)', () => {
  it('T3.1 · crea la unión, ocupa las mesas, asigna mesero y genera sessionId UUID v4', async () => {
    const { servicio, repo, raiz } = crearServicio();

    const respuesta = await servicio.crear(CUERPO, 'corr-1');

    expect(raiz.enTransaccion).toHaveBeenCalledTimes(1);
    expect(repo.bloquearMesas).toHaveBeenCalledWith([MESA_1, MESA_2]);
    expect(repo.crearUnion).toHaveBeenCalledWith('Terraza', AHORA);
    expect(repo.ocuparMesasEnUnion).toHaveBeenCalledWith([MESA_1, MESA_2], UNION_ID, AHORA);
    expect(repo.asignarMesero).toHaveBeenCalledWith([MESA_1, MESA_2], MESERO_ID, AHORA);
    expect(respuesta).toEqual({
      unionId: UNION_ID,
      mesasIds: [MESA_1, MESA_2],
      estado: EstadoMesa.OCUPADA,
      sessionId: expect.stringMatching(UUID_V4),
    });
  });

  it('RN-13 · encola un único sala.dining_session.iniciada con unionId y mesasIds', async () => {
    const { servicio, outbox } = crearServicio();

    const { sessionId } = await servicio.crear(CUERPO, 'corr-1');

    const sesiones = outbox.enqueue.mock.calls.filter(
      ([, evento]) => evento.routingKey === EVENT_TOPICS.DINING_SESSION_INICIADA,
    );
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toEqual([
      TX,
      {
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: {
          sessionId,
          unionId: UNION_ID,
          mesasIds: [MESA_1, MESA_2],
          meseroId: MESERO_ID,
          comensales: 6,
          numComensales: 6,
          timestamp: AHORA.toISOString(),
        },
        correlationId: 'corr-1',
      },
    ]);
  });

  it('encola sala.mesa.estado_actualizado Ocupada con unionId por cada mesa', async () => {
    const { servicio, outbox } = crearServicio();

    await servicio.crear(CUERPO);

    const estados = outbox.enqueue.mock.calls
      .map(([, evento]) => evento)
      .filter((evento) => evento.routingKey === EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO);
    expect(estados.map((evento) => evento.payload)).toEqual([
      {
        mesaId: MESA_1,
        estado: EstadoMesa.OCUPADA,
        unionId: UNION_ID,
        timestamp: AHORA.toISOString(),
      },
      {
        mesaId: MESA_2,
        estado: EstadoMesa.OCUPADA,
        unionId: UNION_ID,
        timestamp: AHORA.toISOString(),
      },
    ]);
  });

  it('400 UNION_INVALIDA sin abrir transacción si llegan menos de 2 mesas', async () => {
    const { servicio, raiz } = crearServicio();

    const error = await capturar(servicio.crear({ ...CUERPO, mesasIds: [MESA_1] }));

    expect(error.code).toBe('UNION_INVALIDA');
    expect(raiz.enTransaccion).not.toHaveBeenCalled();
  });

  describe('rechazos sin modificar ninguna mesa', () => {
    function expectSinEscrituras(
      repo: ReturnType<typeof crearRepo>['repo'],
      outbox: { enqueue: jest.Mock },
    ) {
      expect(repo.crearUnion).not.toHaveBeenCalled();
      expect(repo.ocuparMesasEnUnion).not.toHaveBeenCalled();
      expect(repo.asignarMesero).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    }

    it('T3.2 · 409 ZONA_INCOMPATIBLE', async () => {
      const { servicio, repo, outbox } = crearServicio();
      repo.bloquearMesas.mockResolvedValue([mesa(MESA_1), mesa(MESA_2, { zona: 'Principal' })]);

      const error = await capturar(servicio.crear(CUERPO));

      expect(error).toMatchObject({ status: 409, code: 'ZONA_INCOMPATIBLE' });
      expectSinEscrituras(repo, outbox);
    });

    it('T3.3 · 409 MESA_NO_DISPONIBLE si una mesa está ocupada', async () => {
      const { servicio, repo, outbox } = crearServicio();
      repo.bloquearMesas.mockResolvedValue([
        mesa(MESA_1),
        mesa(MESA_2, { estadoFisico: EstadoMesa.OCUPADA }),
      ]);

      const error = await capturar(servicio.crear(CUERPO));

      expect(error).toMatchObject({ status: 409, code: 'MESA_NO_DISPONIBLE' });
      expectSinEscrituras(repo, outbox);
    });

    it('404 MESA_NO_ENCONTRADA si alguna mesa no existe', async () => {
      const { servicio, repo, outbox } = crearServicio();
      repo.bloquearMesas.mockResolvedValue([mesa(MESA_1)]);

      const error = await capturar(servicio.crear(CUERPO));

      expect(error).toMatchObject({ status: 404, code: 'MESA_NO_ENCONTRADA' });
      expectSinEscrituras(repo, outbox);
    });

    it('RN-02 · 409 SOBRECUPO_DETECTADO si totalPersonas supera la capacidad conjunta', async () => {
      const { servicio, repo, outbox } = crearServicio();

      const error = await capturar(servicio.crear({ ...CUERPO, totalPersonas: 9 }));

      expect(error).toEqual({
        status: 409,
        code: 'SOBRECUPO_DETECTADO',
        details: { totalPersonas: 9, capacidadTotal: 8 },
      });
      expectSinEscrituras(repo, outbox);
    });

    it('RN-05 · 409 RESERVA_PROXIMA_PRESENTE con los datos de la reserva', async () => {
      const { servicio, repo, outbox } = crearServicio();
      const reserva: ReservaProximaEnUnion = {
        mesaId: MESA_2,
        reservaId: 'b1000000-0000-4000-8000-000000000001',
        nombreContacto: 'Ana',
        horaInicio: '12:15',
        cantidadPersonas: 4,
      };
      repo.buscarReservaProxima.mockResolvedValue(reserva);

      const error = await capturar(servicio.crear(CUERPO));

      expect(error).toEqual({ status: 409, code: 'RESERVA_PROXIMA_PRESENTE', details: reserva });
      expect(repo.buscarReservaProxima).toHaveBeenCalledWith(
        [MESA_1, MESA_2],
        AHORA,
        new Date('2030-01-15T12:30:00.000Z'),
      );
      expectSinEscrituras(repo, outbox);
    });
  });

  it('permite sobrecupo y reserva próxima cuando se envían las banderas de confirmación', async () => {
    const { servicio, repo } = crearServicio();
    repo.buscarReservaProxima.mockResolvedValue({
      mesaId: MESA_1,
      reservaId: 'b1000000-0000-4000-8000-000000000001',
      nombreContacto: 'Ana',
      horaInicio: '12:15',
      cantidadPersonas: 4,
    });

    const respuesta = await servicio.crear({
      ...CUERPO,
      totalPersonas: 10,
      forzarSobrecupo: true,
      forzarOcupacion: true,
    });

    expect(respuesta.estado).toBe(EstadoMesa.OCUPADA);
    expect(repo.ocuparMesasEnUnion).toHaveBeenCalled();
  });

  it('A3 · propaga 409 si una mesa cambió concurrentemente (la transacción se revierte)', async () => {
    const { servicio, repo, outbox } = crearServicio();
    repo.ocuparMesasEnUnion.mockResolvedValue(1);

    const error = await capturar(servicio.crear(CUERPO));

    expect(error.code).toBe('MESA_NO_DISPONIBLE');
    expect(repo.asignarMesero).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('A3 · un fallo al encolar en outbox se propaga para revertir la transacción', async () => {
    const { servicio, outbox } = crearServicio();
    outbox.enqueue.mockRejectedValueOnce(new Error('fallo inyectado'));

    await expect(servicio.crear(CUERPO)).rejects.toThrow('fallo inyectado');
  });
});

describe('UnionesService.liberar (BE-009 · F3 · RN-14)', () => {
  it('T3.4 · disuelve la unión, pasa las mesas a Limpieza pendiente y emite unionId null', async () => {
    const { servicio, repo, raiz, outbox } = crearServicio();

    const respuesta = await servicio.liberar(UNION_ID, 'corr-2');

    expect(raiz.enTransaccion).toHaveBeenCalledTimes(1);
    expect(repo.liberarMesasDeUnion).toHaveBeenCalledWith(UNION_ID);
    expect(repo.disolverUnion).toHaveBeenCalledWith(UNION_ID, AHORA);
    expect(respuesta).toEqual({
      mesasIds: [MESA_1, MESA_2],
      estado: EstadoMesa.LIMPIEZA_PENDIENTE,
    });
    expect(outbox.enqueue.mock.calls).toEqual(
      [MESA_1, MESA_2].map((mesaId) => [
        TX,
        {
          routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
          payload: {
            mesaId,
            estado: EstadoMesa.LIMPIEZA_PENDIENTE,
            unionId: null,
            timestamp: AHORA.toISOString(),
          },
          correlationId: 'corr-2',
        },
      ]),
    );
  });

  it('404 UNION_NO_ENCONTRADA si la unión no existe', async () => {
    const { servicio, repo } = crearServicio();
    repo.bloquearUnion.mockResolvedValue(null);

    const error = await capturar(servicio.liberar(UNION_ID));

    expect(error).toMatchObject({ status: 404, code: 'UNION_NO_ENCONTRADA' });
    expect(repo.liberarMesasDeUnion).not.toHaveBeenCalled();
  });

  it('409 TRANSICION_INVALIDA si la unión ya está disuelta', async () => {
    const { servicio, repo, outbox } = crearServicio();
    repo.bloquearUnion.mockResolvedValue({ id: UNION_ID, estado: EstadoUnion.DISUELTA });

    const error = await capturar(servicio.liberar(UNION_ID));

    expect(error).toMatchObject({ status: 409, code: 'TRANSICION_INVALIDA' });
    expect(repo.liberarMesasDeUnion).not.toHaveBeenCalled();
    expect(repo.disolverUnion).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});

describe('UnionesService.listar (SPEC §5.5)', () => {
  it('mapea los registros a UnionDto con fechas ISO', async () => {
    const { servicio, raiz } = crearServicio();
    raiz.listar.mockResolvedValue([
      {
        id: UNION_ID,
        zona: 'Terraza',
        estado: EstadoUnion.ACTIVA,
        fechaCreacion: AHORA,
        fechaDisolucion: null,
        mesasIds: [MESA_1, MESA_2],
      },
    ]);

    const uniones = await servicio.listar();

    expect(raiz.listar).toHaveBeenCalledWith(EstadoUnion.ACTIVA);
    expect(uniones).toEqual([
      {
        unionId: UNION_ID,
        zona: 'Terraza',
        mesasIds: [MESA_1, MESA_2],
        estado: EstadoUnion.ACTIVA,
        fechaCreacion: AHORA.toISOString(),
        fechaDisolucion: null,
      },
    ]);

    raiz.listar.mockResolvedValueOnce([
      {
        id: UNION_ID,
        zona: 'Terraza',
        estado: EstadoUnion.DISUELTA,
        fechaCreacion: AHORA,
        fechaDisolucion: AHORA,
        mesasIds: [],
      },
    ]);
    const disueltas = await servicio.listar(EstadoUnion.DISUELTA);
    expect(disueltas[0].fechaDisolucion).toBe(AHORA.toISOString());
  });
});
