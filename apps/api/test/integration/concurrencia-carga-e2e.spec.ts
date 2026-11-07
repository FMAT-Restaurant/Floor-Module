import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoEspera, EstadoMesa, EstadoReserva, Prisma, PrismaClient } from '@prisma/client';
import { EVENT_TOPICS } from '@floor/shared';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';
import { firmarJwtHs256 } from '../../src/common/auth/jwt-hs256.util';
import { Reloj } from '../../src/common/reloj/reloj';
import { OutboxRelayService } from '../../src/events/outbox-relay.service';
import { ReservasCron } from '../../src/modules/reservas/reservas.cron';

/**
 * BE-012 · Suite de pruebas de carga, concurrencia, resiliencia y flujo End-to-End (E2E)
 * (RNF-001, RNF-002, RNF-003, RNF-004, RNF-012, SPEC.md §7 criterios T1.3, T2.3 y flujos F1..F4).
 */
let ahoraIsoActual = '2030-01-15T12:00:00.000Z';
const PREFIJO = '/api/v1/floor';

const HOST_USER_ID = 'e1000000-0000-4000-8000-000000000002';
const MESERO_USER_ID = 'd1000000-0000-4000-8000-000000000001';

const prisma = new PrismaClient();
let app: NestExpressApplication;
let reservasCron: ReservasCron;
let outboxRelay: OutboxRelayService;
let baseUrl: string;

interface RespuestaMedida<T> {
  status: number;
  cuerpo: T;
  duracionMs: number;
}

type Json = Record<string, unknown>;

function calcularPercentil95(latenciasMs: number[]): number {
  if (latenciasMs.length === 0) return 0;
  const ordenadas = [...latenciasMs].sort((a, b) => a - b);
  const indice = Math.min(ordenadas.length - 1, Math.ceil(ordenadas.length * 0.95) - 1);
  return ordenadas[indice];
}

async function peticionMedida<T = Json>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  headersExtra: Record<string, string> = {},
): Promise<RespuestaMedida<T>> {
  const inicio = performance.now();
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-user-id': HOST_USER_ID,
      'x-staff-id': 'HST000001',
      'x-user-roles': 'ADMINISTRADOR,HOST,MESERO,ROL_CAPITAN',
      ...headersExtra,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  const duracionMs = performance.now() - inicio;
  return {
    status: respuesta.status,
    cuerpo: (texto ? JSON.parse(texto) : null) as T,
    duracionMs,
  };
}

function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> & { numeroMesa: number }) {
  return prisma.mesa.create({
    data: { capacidad: 4, zona: 'Salón Principal', ...datos },
  });
}

describe('BE-012 · Concurrencia, Carga (p95), Resiliencia y Flujo End-to-End', () => {
  beforeAll(async () => {
    delete process.env.GLOBAL_PREFIX;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => new Date(ahoraIsoActual) })
      .compile();

    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    reservasCron = app.get(ReservasCron);
    outboxRelay = app.get(OutboxRelayService);
    baseUrl = await app.getUrl();
    await prisma.$connect();
  });

  beforeEach(async () => {
    ahoraIsoActual = '2030-01-15T12:00:00.000Z';
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Reserva","AsignacionMesero","ListaEspera","Mesa","UnionMesa","outbox_evento" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. Concurrencia masiva de Reservas (RNF-003 · SPEC §7 T2.2 / T2.3)', () => {
    it('50 peticiones simultáneas para reservar la misma mesa en el mismo horario resultan en exactamente 1 éxito (201) y 49 códigos 409 RESERVA_SOLAPADA', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 101, capacidad: 6 });
      const totalSolicitudes = 50;

      const respuestas = await Promise.all(
        Array.from({ length: totalSolicitudes }, (_, idx) =>
          peticionMedida('POST', `${PREFIJO}/reservas`, {
            mesaId: mesa.id,
            fecha: '2030-01-20',
            horaInicio: '20:00',
            duracion: 90,
            cantidadPersonas: 4,
            cliente: {
              nombre: `Comensal Concurrente ${idx + 1}`,
              tel: '+52 999 100 2000',
            },
          }),
        ),
      );

      const exitosas = respuestas.filter((r) => r.status === 201);
      const conflictivas = respuestas.filter((r) => r.status === 409);
      const errores500 = respuestas.filter((r) => r.status >= 500);

      expect(errores500).toHaveLength(0);
      expect(exitosas).toHaveLength(1);
      expect(conflictivas).toHaveLength(49);

      for (const conflicto of conflictivas) {
        expect(conflicto.cuerpo).toMatchObject({
          statusCode: 409,
          code: 'RESERVA_SOLAPADA',
        });
      }

      const reservasEnBd = await prisma.reserva.findMany({
        where: { mesaId: mesa.id, estado: EstadoReserva.Confirmada },
      });
      expect(reservasEnBd).toHaveLength(1);
      expect(reservasEnBd[0]?.id).toBe(exitosas[0]?.cuerpo.reservaId);
    });
  });

  describe('2. Concurrencia de Ocupación y Uniones de Mesas (RNF-004 · SPEC §7 F1 A4 / T1.3)', () => {
    it('25 peticiones simultáneas de ocupación sobre la misma mesa garantizan exactamente 1 dining session iniciada (200) y 24 rechazos 409 MESA_NO_DISPONIBLE', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 102, capacidad: 4 });
      const totalConcurrentes = 25;

      const respuestas = await Promise.all(
        Array.from({ length: totalConcurrentes }, () =>
          peticionMedida('POST', `${PREFIJO}/mesas/${mesa.id}/ocupar`, {
            comensales: 4,
            meseroId: MESERO_USER_ID,
          }),
        ),
      );

      const exitosas = respuestas.filter((r) => r.status === 200);
      const conflictivas = respuestas.filter((r) => r.status === 409);

      expect(exitosas).toHaveLength(1);
      expect(conflictivas).toHaveLength(totalConcurrentes - 1);
      expect(exitosas[0]?.cuerpo).toMatchObject({
        mesaId: mesa.id,
        estado: 'Ocupada',
        sessionId: expect.any(String),
      });

      for (const conflicto of conflictivas) {
        expect(conflicto.cuerpo).toMatchObject({
          statusCode: 409,
          code: 'MESA_NO_DISPONIBLE',
        });
      }

      const eventosDiningSession = await prisma.outboxEvento.count({
        where: { routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA },
      });
      const asignacionesActivas = await prisma.asignacionMesero.count({
        where: { mesaId: mesa.id, activo: true },
      });

      expect(eventosDiningSession).toBe(1);
      expect(asignacionesActivas).toBe(1);
    });

    it('T1.3 · Concurrencia en ocupación forzada con reserva próxima: exactamente 1 petición gana con advertencias y el resto recibe 409', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 103, capacidad: 4 });

      await peticionMedida('POST', `${PREFIJO}/reservas`, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '12:10',
        duracion: 60,
        cantidadPersonas: 4,
        cliente: { nombre: 'Titular Reserva Próxima', tel: '9991112233' },
      });

      // Sin forzarOcupacion debe rechazar con 409 RESERVA_PROXIMA_PRESENTE
      const bloqueoSinForzar = await peticionMedida('POST', `${PREFIJO}/mesas/${mesa.id}/ocupar`, {
        comensales: 2,
        meseroId: MESERO_USER_ID,
      });
      expect(bloqueoSinForzar.status).toBe(409);
      expect(bloqueoSinForzar.cuerpo).toMatchObject({ code: 'RESERVA_PROXIMA_PRESENTE' });

      // 10 peticiones simultáneas enviando forzarOcupacion: true y forzarSobrecupo: true
      const respuestasForzadas = await Promise.all(
        Array.from({ length: 10 }, () =>
          peticionMedida('POST', `${PREFIJO}/mesas/${mesa.id}/ocupar`, {
            comensales: 6,
            meseroId: MESERO_USER_ID,
            forzarOcupacion: true,
            forzarSobrecupo: true,
          }),
        ),
      );

      const exitosas = respuestasForzadas.filter((r) => r.status === 200);
      const conflictivas = respuestasForzadas.filter((r) => r.status === 409);

      expect(exitosas).toHaveLength(1);
      expect(conflictivas).toHaveLength(9);
      expect(exitosas[0]?.cuerpo).toMatchObject({
        mesaId: mesa.id,
        estado: 'Ocupada',
        advertencias: expect.arrayContaining([expect.any(String)]),
      });
    });

    it('Uniones concurrentes que compiten por una mesa en común mantienen atomicidad sin estados parciales', async () => {
      const m1 = await crearMesaDb({ numeroMesa: 1, capacidad: 4, zona: 'Terraza' });
      const m2 = await crearMesaDb({ numeroMesa: 2, capacidad: 4, zona: 'Terraza' });
      const m3 = await crearMesaDb({ numeroMesa: 3, capacidad: 4, zona: 'Terraza' });

      const [u1, u2] = await Promise.all([
        peticionMedida('POST', `${PREFIJO}/mesas/uniones`, {
          mesasIds: [m1.id, m2.id],
          totalPersonas: 6,
          meseroId: MESERO_USER_ID,
        }),
        peticionMedida('POST', `${PREFIJO}/mesas/uniones`, {
          mesasIds: [m2.id, m3.id],
          totalPersonas: 6,
          meseroId: MESERO_USER_ID,
        }),
      ]);

      const estados = [u1.status, u2.status].sort();
      expect(estados).toEqual([201, 409]);

      const unionesActivas = await prisma.unionMesa.count({ where: { estado: 'Activa' } });
      const mesasOcupadas = await prisma.mesa.count({
        where: { estadoFisico: EstadoMesa.Ocupada },
      });
      expect(unionesActivas).toBe(1);
      expect(mesasOcupadas).toBe(2);
    });
  });

  describe('3. Medición de Latencia p95 bajo Carga de 50 req (RNF-001 · RNF-012)', () => {
    it('confirma latencia p95 < 300 ms en consultas (GET /estado-en-vivo y /disponibilidad) y p95 < 500 ms en comandos bajo ráfaga de 50 peticiones', async () => {
      const mesas = await Promise.all(
        Array.from({ length: 50 }, (_, idx) =>
          crearMesaDb({
            numeroMesa: idx + 1,
            capacidad: 4,
            zona: idx % 2 === 0 ? 'Salón Principal' : 'Terraza',
          }),
        ),
      );

      // Calentamiento de pool de conexiones
      await peticionMedida('GET', `${PREFIJO}/mesas/estado-en-vivo`);

      // Ráfaga de 50 consultas simultáneas (25 estado-en-vivo + 25 disponibilidad)
      const consultas = await Promise.all(
        Array.from({ length: 50 }, (_, idx) =>
          idx % 2 === 0
            ? peticionMedida('GET', `${PREFIJO}/mesas/estado-en-vivo`)
            : peticionMedida(
                'GET',
                `${PREFIJO}/reservas/disponibilidad?fecha=2030-01-25&horaInicio=19:00&duracion=90&personas=4`,
              ),
        ),
      );

      for (const c of consultas) {
        expect(c.status).toBe(200);
      }
      const p95Consultas = calcularPercentil95(consultas.map((c) => c.duracionMs));
      expect(p95Consultas).toBeLessThan(300);

      // Ráfaga de 50 comandos de escritura sobre las 50 mesas
      const comandos = await Promise.all(
        mesas.map((mesa, idx) =>
          peticionMedida('POST', `${PREFIJO}/reservas`, {
            mesaId: mesa.id,
            fecha: '2030-01-26',
            horaInicio: '20:00',
            duracion: 90,
            cantidadPersonas: 2,
            cliente: { nombre: `Carga ${idx + 1}`, tel: '9990001122' },
          }),
        ),
      );

      for (const cmd of comandos) {
        expect(cmd.status).toBe(201);
      }
      const p95Comandos = calcularPercentil95(comandos.map((c) => c.duracionMs));
      expect(p95Comandos).toBeLessThan(500);
    });
  });

  describe('4. Prueba End-to-End (E2E) del Ciclo Operativo Completo con WebSocket en Vivo', () => {
    let socketCliente: ClientSocket | null = null;

    afterEach(() => {
      if (socketCliente) {
        socketCliente.disconnect();
        socketCliente = null;
      }
    });

    it('ejecuta de punta a punta F1 (Ocupación), F2 (Reserva + Alerta), F3 (Unión/Disolución) y F4 (Lista de Espera FIFO) difundiendo eventos por WebSocket', async () => {
      const tokenJwt = firmarJwtHs256({
        sub: HOST_USER_ID,
        staffId: 'HST000001',
        roles: ['ADMINISTRADOR', 'HOST', 'MESERO', 'ROL_CAPITAN'],
        iss: 'urn:fmat:restaurant:auth',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const eventosMesaWs: Json[] = [];
      const alertasReservaWs: Json[] = [];
      const alertasEsperaWs: Json[] = [];

      socketCliente = createSocketClient(`${baseUrl}/sala`, {
        auth: { token: `Bearer ${tokenJwt}` },
        transports: ['websocket'],
      });

      await new Promise<void>((resolve, reject) => {
        socketCliente?.once('connect', () => resolve());
        socketCliente?.once('connect_error', reject);
      });

      await socketCliente.emitWithAck('joinRoom', { salas: ['plano', 'recepcion'] });
      socketCliente.on('mesa.estado_actualizado', (payload: Json) => eventosMesaWs.push(payload));
      socketCliente.on('reserva.proxima_alerta', (payload: Json) => alertasReservaWs.push(payload));
      socketCliente.on('espera.mesa_disponible', (payload: Json) => alertasEsperaWs.push(payload));

      // Paso 1: Crear 3 mesas por API REST (RF-001)
      const m1Res = await peticionMedida<{ mesaId: string }>('POST', `${PREFIJO}/mesas`, {
        numeroMesa: 1,
        capacidad: 4,
        zona: 'Terraza',
      });
      const m2Res = await peticionMedida<{ mesaId: string }>('POST', `${PREFIJO}/mesas`, {
        numeroMesa: 2,
        capacidad: 4,
        zona: 'Terraza',
      });
      const m3Res = await peticionMedida<{ mesaId: string }>('POST', `${PREFIJO}/mesas`, {
        numeroMesa: 3,
        capacidad: 4,
        zona: 'Salón Principal',
      });
      expect(m1Res.status).toBe(201);
      expect(m2Res.status).toBe(201);
      expect(m3Res.status).toBe(201);

      const mesa1Id = m1Res.cuerpo.mesaId;
      const mesa2Id = m2Res.cuerpo.mesaId;
      const mesa3Id = m3Res.cuerpo.mesaId;

      // Paso 2 (F2): Agendar reserva próxima para Mesa 3 (12:12, dentro de ventana de 15/30 min) y disparar cron
      const resCreada = await peticionMedida<{ reservaId: string }>('POST', `${PREFIJO}/reservas`, {
        mesaId: mesa3Id,
        fecha: '2030-01-15',
        horaInicio: '12:12',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Elena Castillo', tel: '+52 999 444 5566' },
      });
      expect(resCreada.status).toBe(201);

      await reservasCron.checkReservasProximas();
      await outboxRelay.processPendingEvents();
      await new Promise((r) => setTimeout(r, 80));

      expect(alertasReservaWs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reservaId: resCreada.cuerpo.reservaId,
            mesaId: mesa3Id,
          }),
        ]),
      );

      // Paso 3 (F1): Sentar a los titulares de la reserva en Mesa 3 pasando reservaId
      const ocuparRes = await peticionMedida('POST', `${PREFIJO}/mesas/${mesa3Id}/ocupar`, {
        comensales: 4,
        meseroId: MESERO_USER_ID,
        reservaId: resCreada.cuerpo.reservaId,
      });
      expect(ocuparRes.status).toBe(200);

      const reservaCompletada = await prisma.reserva.findUniqueOrThrow({
        where: { id: resCreada.cuerpo.reservaId },
      });
      expect(reservaCompletada.estado).toBe(EstadoReserva.Completada);

      // Paso 4 (F3): Crear unión atómica entre Mesa 1 y Mesa 2 (misma zona Terraza) y luego liberarla
      const unionRes = await peticionMedida<{ unionId: string }>(
        'POST',
        `${PREFIJO}/mesas/uniones`,
        {
          mesasIds: [mesa1Id, mesa2Id],
          totalPersonas: 7,
          meseroId: MESERO_USER_ID,
        },
      );
      expect(unionRes.status).toBe(201);

      const liberarUnionRes = await peticionMedida(
        'POST',
        `${PREFIJO}/mesas/uniones/${unionRes.cuerpo.unionId}/liberar`,
      );
      expect(liberarUnionRes.status).toBe(200);

      // Paso 5 (F4): Registrar cliente en Lista de Espera y finalizar limpieza de Mesa 1 -> Notificación FIFO automática
      const esperaRes = await peticionMedida<{ esperaId: string }>('POST', `${PREFIJO}/espera`, {
        nombreCliente: 'Familia Morales',
        telefonoContacto: '+52 999 777 8899',
        cantidadPersonas: 3,
      });
      expect(esperaRes.status).toBe(201);

      const finLimpieza = await peticionMedida('PATCH', `${PREFIJO}/mesas/${mesa1Id}/estado`, {
        estado: 'Libre',
      });
      expect(finLimpieza.status).toBe(200);

      await outboxRelay.processPendingEvents();
      await new Promise((r) => setTimeout(r, 80));

      const turnoNotificado = await prisma.listaEspera.findUniqueOrThrow({
        where: { id: esperaRes.cuerpo.esperaId },
      });
      expect(turnoNotificado.estado).toBe(EstadoEspera.Notificado);
      expect(turnoNotificado.mesaAsignadaId).toBe(mesa1Id);

      expect(alertasEsperaWs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mesaId: mesa1Id,
            esperaId: esperaRes.cuerpo.esperaId,
          }),
        ]),
      );
      expect(eventosMesaWs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
