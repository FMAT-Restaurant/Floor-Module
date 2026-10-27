import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoMesa, EstadoReserva, EstadoUnion, Prisma, PrismaClient } from '@prisma/client';
import { EVENT_TOPICS } from '@floor/shared';
import { AppModule } from '../../src/app.module';
import { configurarApp, PREFIJO_GLOBAL } from '../../src/app.setup';
import { Reloj } from '../../src/common/reloj/reloj';
import { OutboxService } from '../../src/events/outbox.service';

/**
 * BE-009 · POST /mesas/uniones, POST /mesas/uniones/{unionId}/liberar y GET /mesas/uniones
 * contra PostgreSQL real (RF-018, RF-019, RNF-004, RN-12..RN-14, ADR-009, SPEC §5.5 y F3).
 * Incluye pruebas de atomicidad con errores inyectados a mitad de la transacción.
 */
const RUTA = `/${PREFIJO_GLOBAL}/mesas/uniones`;
const MESA_INEXISTENTE = 'a9999999-9999-4999-8999-999999999999';
const UNION_INEXISTENTE = 'c9999999-9999-4999-8999-999999999999';
const USUARIO = 'e1000000-0000-4000-8000-000000000001';
const MESERO = 'e2000000-0000-4000-8000-000000000002';
const AHORA_FIJO = new Date('2030-01-15T12:00:00.000Z');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const prisma = new PrismaClient();
let app: NestExpressApplication;
let baseUrl: string;
let outbox: OutboxService;

type Json = Record<string, unknown>;

async function peticion<T = Json>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  roles = 'HOST',
): Promise<{ status: number; cuerpo: T }> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-user-id': USUARIO,
      'x-staff-id': 'HOST-01',
      'x-user-roles': roles,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: (texto ? JSON.parse(texto) : null) as T };
}

function crearUnionHttp(cuerpo: unknown, roles?: string) {
  return peticion('POST', RUTA, cuerpo, roles);
}

function liberarUnionHttp(unionId: string, roles?: string) {
  return peticion('POST', `${RUTA}/${unionId}/liberar`, undefined, roles);
}

let numeroMesa = 0;
function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> = {}) {
  numeroMesa += 1;
  return prisma.mesa.create({
    data: { numeroMesa, capacidad: 4, zona: 'Terraza', ...datos },
  });
}

async function instantaneaBd() {
  const [mesas, uniones, asignaciones, eventos] = await Promise.all([
    prisma.mesa.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, estadoFisico: true, unionMesaId: true, ocupadaDesde: true },
    }),
    prisma.unionMesa.findMany({ orderBy: { id: 'asc' } }),
    prisma.asignacionMesero.findMany({ orderBy: { id: 'asc' } }),
    prisma.outboxEvento.count(),
  ]);
  return { mesas, uniones, asignaciones, eventos };
}

describe('Uniones de mesas (BE-009 · F3)', () => {
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => AHORA_FIJO })
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    outbox = app.get(OutboxService, { strict: false });
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Reserva","AsignacionMesero","ListaEspera","Mesa","UnionMesa","outbox_evento" CASCADE',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /mesas/uniones', () => {
    it('T3.1 · une mesas libres de la misma zona: 201, todas Ocupada y 1 dining session', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb({ capacidad: 2 });

      const { status, cuerpo } = await crearUnionHttp({
        mesasIds: [m1.id, m2.id],
        totalPersonas: 6,
        meseroId: MESERO,
      });

      expect(status).toBe(201);
      expect(cuerpo).toEqual({
        unionId: expect.stringMatching(UUID_V4),
        mesasIds: [m1.id, m2.id],
        estado: 'Ocupada',
        sessionId: expect.stringMatching(UUID_V4),
      });

      const unionId = cuerpo.unionId as string;
      const union = await prisma.unionMesa.findUniqueOrThrow({ where: { id: unionId } });
      expect(union).toMatchObject({ zona: 'Terraza', estado: EstadoUnion.Activa });

      const mesas = await prisma.mesa.findMany({ where: { id: { in: [m1.id, m2.id] } } });
      for (const mesa of mesas) {
        expect(mesa.estadoFisico).toBe(EstadoMesa.Ocupada);
        expect(mesa.unionMesaId).toBe(unionId);
        expect(mesa.ocupadaDesde).toEqual(AHORA_FIJO);
      }

      const asignaciones = await prisma.asignacionMesero.findMany({ where: { activo: true } });
      expect(asignaciones.map((a) => [a.mesaId, a.meseroId]).sort()).toEqual(
        [
          [m1.id, MESERO],
          [m2.id, MESERO],
        ].sort(),
      );

      const sesiones = await prisma.outboxEvento.findMany({
        where: { routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA },
      });
      expect(sesiones).toHaveLength(1);
      expect(sesiones[0].payload).toEqual({
        sessionId: cuerpo.sessionId,
        unionId,
        mesasIds: [m1.id, m2.id],
        meseroId: MESERO,
        comensales: 6,
        numComensales: 6,
        timestamp: AHORA_FIJO.toISOString(),
      });

      const estados = await prisma.outboxEvento.findMany({
        where: { routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO },
      });
      expect(estados.map((e) => e.payload)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ mesaId: m1.id, estado: 'Ocupada', unionId }),
          expect.objectContaining({ mesaId: m2.id, estado: 'Ocupada', unionId }),
        ]),
      );
    });

    it('T3.2 · mesas de zonas distintas: 409 ZONA_INCOMPATIBLE sin modificar nada', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb({ zona: 'Principal' });
      const antes = await instantaneaBd();

      const { status, cuerpo } = await crearUnionHttp({
        mesasIds: [m1.id, m2.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ statusCode: 409, code: 'ZONA_INCOMPATIBLE' });
      expect(await instantaneaBd()).toEqual(antes);
    });

    it('T3.3 · una mesa ocupada: 409 MESA_NO_DISPONIBLE sin modificar el resto', async () => {
      const libre = await crearMesaDb();
      const ocupada = await crearMesaDb({ estadoFisico: EstadoMesa.Ocupada });
      const antes = await instantaneaBd();

      const { status, cuerpo } = await crearUnionHttp({
        mesasIds: [libre.id, ocupada.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({
        code: 'MESA_NO_DISPONIBLE',
        details: { mesas: [{ mesaId: ocupada.id, estadoFisico: 'Ocupada', unionId: null }] },
      });
      expect(await instantaneaBd()).toEqual(antes);
    });

    it('RN-12 · una mesa ya unida a otra unión activa: 409 MESA_NO_DISPONIBLE', async () => {
      const [m1, m2, m3] = [await crearMesaDb(), await crearMesaDb(), await crearMesaDb()];
      await crearUnionHttp({ mesasIds: [m1.id, m2.id], totalPersonas: 4, meseroId: MESERO });

      const { status, cuerpo } = await crearUnionHttp({
        mesasIds: [m2.id, m3.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });

      expect(status).toBe(409);
      expect(cuerpo.code).toBe('MESA_NO_DISPONIBLE');
      const m3Fila = await prisma.mesa.findUniqueOrThrow({ where: { id: m3.id } });
      expect(m3Fila).toMatchObject({ estadoFisico: EstadoMesa.Libre, unionMesaId: null });
    });

    it('404 MESA_NO_ENCONTRADA si alguna mesa no existe o está inactiva', async () => {
      const m1 = await crearMesaDb();
      const inactiva = await crearMesaDb({ activo: false });

      const { status, cuerpo } = await crearUnionHttp({
        mesasIds: [m1.id, inactiva.id, MESA_INEXISTENTE],
        totalPersonas: 4,
        meseroId: MESERO,
      });

      expect(status).toBe(404);
      expect(cuerpo).toMatchObject({
        code: 'MESA_NO_ENCONTRADA',
        details: { mesasIds: [inactiva.id, MESA_INEXISTENTE] },
      });
    });

    it.each([
      ['una sola mesa', { mesasIds: ['a1000000-0000-4000-8000-000000000001'] }],
      [
        'mesas duplicadas',
        {
          mesasIds: [
            'a1000000-0000-4000-8000-000000000001',
            'a1000000-0000-4000-8000-000000000001',
          ],
        },
      ],
      ['UUID inválido', { mesasIds: ['no-uuid', 'a1000000-0000-4000-8000-000000000001'] }],
    ])('SPEC §8 · 400 con %s', async (_caso, parcial) => {
      const { status } = await crearUnionHttp({ totalPersonas: 2, meseroId: MESERO, ...parcial });

      expect(status).toBe(400);
    });

    it('RN-02 · 409 SOBRECUPO_DETECTADO sin forzar; 201 con forzarSobrecupo', async () => {
      const m1 = await crearMesaDb({ capacidad: 2 });
      const m2 = await crearMesaDb({ capacidad: 2 });
      const cuerpo = { mesasIds: [m1.id, m2.id], totalPersonas: 5, meseroId: MESERO };

      const rechazo = await crearUnionHttp(cuerpo);
      expect(rechazo.status).toBe(409);
      expect(rechazo.cuerpo).toMatchObject({
        code: 'SOBRECUPO_DETECTADO',
        details: { totalPersonas: 5, capacidadTotal: 4 },
      });
      expect(await prisma.unionMesa.count()).toBe(0);

      const forzada = await crearUnionHttp({ ...cuerpo, forzarSobrecupo: true });
      expect(forzada.status).toBe(201);
    });

    it('RN-05 · 409 RESERVA_PROXIMA_PRESENTE sin forzar; 201 con forzarOcupacion', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb();
      const reserva = await prisma.reserva.create({
        data: {
          mesaId: m2.id,
          nombreContacto: 'Laura Gómez',
          telefonoContacto: '9991112233',
          cantidadPersonas: 4,
          fechaReserva: new Date('2030-01-15T00:00:00.000Z'),
          horaInicio: new Date('1970-01-01T12:20:00.000Z'),
          horaFin: new Date('1970-01-01T14:20:00.000Z'),
          estado: EstadoReserva.Confirmada,
        },
      });
      const cuerpo = { mesasIds: [m1.id, m2.id], totalPersonas: 6, meseroId: MESERO };

      const rechazo = await crearUnionHttp(cuerpo);
      expect(rechazo.status).toBe(409);
      expect(rechazo.cuerpo).toMatchObject({
        code: 'RESERVA_PROXIMA_PRESENTE',
        details: {
          mesaId: m2.id,
          reservaId: reserva.id,
          nombreContacto: 'Laura Gómez',
          horaInicio: '12:20',
          cantidadPersonas: 4,
        },
      });

      const forzada = await crearUnionHttp({ ...cuerpo, forzarOcupacion: true });
      expect(forzada.status).toBe(201);
    });

    it('SPEC §1.1 · el rol MESERO no puede crear uniones (403)', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb();

      const { status } = await crearUnionHttp(
        { mesasIds: [m1.id, m2.id], totalPersonas: 4, meseroId: MESERO },
        'MESERO',
      );

      expect(status).toBe(403);
    });

    it('A4 · dos uniones concurrentes sobre la misma mesa: exactamente una tiene éxito', async () => {
      const [m1, m2, m3] = [await crearMesaDb(), await crearMesaDb(), await crearMesaDb()];

      const respuestas = await Promise.all([
        crearUnionHttp({ mesasIds: [m1.id, m2.id], totalPersonas: 4, meseroId: MESERO }),
        crearUnionHttp({ mesasIds: [m3.id, m2.id], totalPersonas: 4, meseroId: MESERO }),
      ]);

      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.unionMesa.count()).toBe(1);
      expect(
        await prisma.outboxEvento.count({
          where: { routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA },
        }),
      ).toBe(1);
    });

    it('RNF-004 · un error inyectado tras ocupar las mesas revierte toda la transacción', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb();
      const antes = await instantaneaBd();
      const original = outbox.enqueue.bind(outbox);
      let llamadas = 0;
      // Falla al encolar el último evento: mesas, unión, asignaciones y otros eventos ya se escribieron.
      jest.spyOn(outbox, 'enqueue').mockImplementation(((...args: Parameters<typeof original>) => {
        llamadas += 1;
        if (llamadas === 3) return Promise.reject(new Error('fallo inyectado en outbox'));
        return original(...args);
      }) as typeof outbox.enqueue);

      const { status, cuerpo } = await crearUnionHttp({
        mesasIds: [m1.id, m2.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });

      expect(llamadas).toBe(3);
      expect(status).toBe(500);
      expect(cuerpo).toMatchObject({ code: 'ERROR_INTERNO' });
      expect(await instantaneaBd()).toEqual(antes);
    });
  });

  describe('POST /mesas/uniones/{unionId}/liberar', () => {
    async function crearUnionActiva() {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb();
      const { cuerpo } = await crearUnionHttp({
        mesasIds: [m1.id, m2.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });
      await prisma.outboxEvento.deleteMany();
      return { unionId: cuerpo.unionId as string, mesasIds: [m1.id, m2.id] };
    }

    it('T3.4 · disuelve la unión y pasa todas las mesas a Limpieza pendiente desvinculadas', async () => {
      const { unionId, mesasIds } = await crearUnionActiva();

      const { status, cuerpo } = await liberarUnionHttp(unionId);

      expect(status).toBe(200);
      expect(cuerpo).toEqual({
        mesasIds: [...mesasIds].sort(),
        estado: 'Limpieza pendiente',
      });

      const union = await prisma.unionMesa.findUniqueOrThrow({ where: { id: unionId } });
      expect(union.estado).toBe(EstadoUnion.Disuelta);
      expect(union.fechaDisolucion).toEqual(AHORA_FIJO);

      const mesas = await prisma.mesa.findMany({ where: { id: { in: mesasIds } } });
      for (const mesa of mesas) {
        expect(mesa).toMatchObject({
          estadoFisico: EstadoMesa.Limpieza_pendiente,
          unionMesaId: null,
          ocupadaDesde: null,
        });
      }

      const eventos = await prisma.outboxEvento.findMany();
      expect(eventos).toHaveLength(2);
      for (const evento of eventos) {
        expect(evento.routingKey).toBe(EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO);
        expect(evento.payload).toMatchObject({ estado: 'Limpieza pendiente', unionId: null });
      }
    });

    it('409 TRANSICION_INVALIDA al liberar una unión ya disuelta', async () => {
      const { unionId } = await crearUnionActiva();
      await liberarUnionHttp(unionId);

      const { status, cuerpo } = await liberarUnionHttp(unionId);

      expect(status).toBe(409);
      expect(cuerpo.code).toBe('TRANSICION_INVALIDA');
    });

    it('404 UNION_NO_ENCONTRADA si la unión no existe', async () => {
      const { status, cuerpo } = await liberarUnionHttp(UNION_INEXISTENTE);

      expect(status).toBe(404);
      expect(cuerpo.code).toBe('UNION_NO_ENCONTRADA');
    });

    it('400 si unionId no es un UUID', async () => {
      const { status } = await liberarUnionHttp('no-uuid');

      expect(status).toBe(400);
    });

    it('RNF-004 · un error inyectado a mitad de la disolución no deja estados parciales', async () => {
      const { unionId } = await crearUnionActiva();
      const antes = await instantaneaBd();
      const original = outbox.enqueue.bind(outbox);
      let llamadas = 0;
      jest.spyOn(outbox, 'enqueue').mockImplementation(((...args: Parameters<typeof original>) => {
        llamadas += 1;
        if (llamadas === 2) return Promise.reject(new Error('fallo inyectado en outbox'));
        return original(...args);
      }) as typeof outbox.enqueue);

      const { status } = await liberarUnionHttp(unionId);

      expect(status).toBe(500);
      expect(await instantaneaBd()).toEqual(antes);
      const union = await prisma.unionMesa.findUniqueOrThrow({ where: { id: unionId } });
      expect(union.estado).toBe(EstadoUnion.Activa);
    });

    it('RN-15 · tras liberar, las mesas vuelven a admitir cambios individuales', async () => {
      const { unionId, mesasIds } = await crearUnionActiva();
      const bloqueada = await peticion('PATCH', `/${PREFIJO_GLOBAL}/mesas/${mesasIds[0]}/estado`, {
        estado: 'Limpieza pendiente',
      });
      expect(bloqueada.cuerpo.code).toBe('MESA_EN_UNION');

      await liberarUnionHttp(unionId);
      const libre = await peticion('PATCH', `/${PREFIJO_GLOBAL}/mesas/${mesasIds[0]}/estado`, {
        estado: 'Libre',
      });

      expect(libre.status).toBe(200);
    });
  });

  describe('GET /mesas/uniones', () => {
    it('lista las uniones activas por defecto (la ruta no colisiona con /mesas/:mesaId)', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb();
      const creada = await crearUnionHttp({
        mesasIds: [m1.id, m2.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });

      const { status, cuerpo } = await peticion<Json[]>('GET', RUTA, undefined, 'MESERO');

      expect(status).toBe(200);
      expect(cuerpo).toEqual([
        {
          unionId: creada.cuerpo.unionId,
          zona: 'Terraza',
          mesasIds: [m1.id, m2.id],
          estado: 'Activa',
          fechaCreacion: AHORA_FIJO.toISOString(),
          fechaDisolucion: null,
        },
      ]);
    });

    it('filtra por estado=Disuelta', async () => {
      const m1 = await crearMesaDb();
      const m2 = await crearMesaDb();
      const creada = await crearUnionHttp({
        mesasIds: [m1.id, m2.id],
        totalPersonas: 4,
        meseroId: MESERO,
      });
      await liberarUnionHttp(creada.cuerpo.unionId as string);

      const activas = await peticion<Json[]>('GET', RUTA);
      const disueltas = await peticion<Json[]>('GET', `${RUTA}?estado=Disuelta`);

      expect(activas.cuerpo).toEqual([]);
      expect(disueltas.cuerpo).toEqual([
        expect.objectContaining({
          unionId: creada.cuerpo.unionId,
          estado: 'Disuelta',
          fechaDisolucion: AHORA_FIJO.toISOString(),
        }),
      ]);
    });
  });
});
