import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoEspera, EstadoMesa, Prisma, PrismaClient } from '@prisma/client';
import type { EsperaMesaDisponiblePayload } from '@floor/shared';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { configurarApp, PREFIJO_GLOBAL } from '../../src/app.setup';
import { Reloj } from '../../src/common/reloj/reloj';
import {
  firmarTokenJwtHs256,
  SALA_WS_EVENTS,
  SALA_WS_NAMESPACE,
  SALA_WS_ROOMS,
} from '../../src/gateways';

/**
 * BE-010 · Pruebas de integración extremo a extremo de Lista de Espera y flujo F4 de liberación
 * contra PostgreSQL real y Socket.io en tiempo real (RF-020, RF-021, RF-022, RN-17, SPEC §5.6, F4).
 */
const RUTA_ESPERA = `/${PREFIJO_GLOBAL}/espera`;
const RUTA_MESAS = `/${PREFIJO_GLOBAL}/mesas`;
const ESPERA_INEXISTENTE = 'e9999999-9999-4999-8999-999999999999';
const USUARIO_HOST = 'e1000000-0000-4000-8000-000000000001';
const AHORA_FIJO = new Date('2030-01-15T12:00:00.000Z');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TOKEN_RECEPCION = firmarTokenJwtHs256({
  sub: USUARIO_HOST,
  staffId: 'H000101',
  roles: ['HOST'],
  iss: 'urn:fmat:restaurant:auth',
});

const prisma = new PrismaClient();
let app: NestExpressApplication;
let baseUrl: string;
const socketsActivos: ClientSocket[] = [];

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
      'x-user-id': USUARIO_HOST,
      'x-staff-id': 'H000101',
      'x-user-roles': roles,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: (texto ? JSON.parse(texto) : null) as T };
}

let contadorMesa = 0;
function crearMesaEnLimpiezaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> = {}) {
  contadorMesa += 1;
  return prisma.mesa.create({
    data: {
      numeroMesa: contadorMesa,
      capacidad: 4,
      zona: 'Principal',
      estadoFisico: EstadoMesa.Limpieza_pendiente,
      ...datos,
    },
  });
}

async function conectarClienteRecepcion(): Promise<ClientSocket> {
  const socket = io(`${baseUrl}${SALA_WS_NAMESPACE}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { token: `Bearer ${TOKEN_RECEPCION}` },
  });
  socketsActivos.push(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  await socket.emitWithAck('joinRoom', { room: SALA_WS_ROOMS.RECEPCION });
  return socket;
}

describe('Lista de espera presencial y flujo de liberación FIFO (BE-010 · SPEC §5.6, F4)', () => {
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => AHORA_FIJO })
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Reserva","AsignacionMesero","ListaEspera","Mesa","UnionMesa","outbox_evento" CASCADE',
    );
  });

  afterEach(() => {
    while (socketsActivos.length > 0) {
      socketsActivos.pop()?.disconnect();
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /espera y GET /espera (RF-021, SPEC §5.6)', () => {
    it('registra un cliente con horaLlegada automática y estado En espera (201)', async () => {
      const { status, cuerpo } = await peticion('POST', RUTA_ESPERA, {
        nombreCliente: 'Gabriel Torres',
        telefonoContacto: '+52 999 111 2233',
        cantidadPersonas: 3,
      });

      expect(status).toBe(201);
      expect(cuerpo).toEqual({
        esperaId: expect.stringMatching(UUID_V4),
        nombreCliente: 'Gabriel Torres',
        telefonoContacto: '+52 999 111 2233',
        cantidadPersonas: 3,
        horaLlegada: AHORA_FIJO.toISOString(),
        estado: 'En espera',
        idMesaAsignada: null,
      });
    });

    it('lista por defecto los registros activos (En espera, Notificado) en orden FIFO y filtra por estado', async () => {
      const mesa = await crearMesaEnLimpiezaDb();
      const eTarde = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Valeria Méndez',
          telefonoContacto: '+52 999 444 5566',
          cantidadPersonas: 4,
          horaLlegada: new Date('2030-01-15T12:20:00.000Z'),
          estado: EstadoEspera.Notificado,
          mesaAsignadaId: mesa.id,
        },
      });
      const eTemprano = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Gabriel Torres',
          telefonoContacto: '+52 999 111 2233',
          cantidadPersonas: 2,
          horaLlegada: new Date('2030-01-15T12:05:00.000Z'),
          estado: EstadoEspera.En_espera,
        },
      });
      const eCancelado = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Mónica Ruiz',
          telefonoContacto: '+52 999 222 3344',
          cantidadPersonas: 3,
          horaLlegada: new Date('2030-01-15T11:50:00.000Z'),
          estado: EstadoEspera.Cancelado,
        },
      });

      const activos = await peticion<Json[]>('GET', RUTA_ESPERA, undefined, 'MESERO');
      expect(activos.status).toBe(200);
      expect(activos.cuerpo.map((e) => e.esperaId)).toEqual([eTemprano.id, eTarde.id]);

      const cancelados = await peticion<Json[]>(
        'GET',
        `${RUTA_ESPERA}?estado=Cancelado`,
        undefined,
        'HOST',
      );
      expect(cancelados.status).toBe(200);
      expect(cancelados.cuerpo.map((e) => e.esperaId)).toEqual([eCancelado.id]);
    });

    it('valida el payload (400 VALIDACION) y los permisos por rol (403 NO_AUTORIZADO para MESERO en POST)', async () => {
      const invalido = await peticion('POST', RUTA_ESPERA, {
        nombreCliente: '',
        telefonoContacto: '123',
        cantidadPersonas: 0,
      });
      expect(invalido.status).toBe(400);
      expect(invalido.cuerpo.code).toBe('VALIDACION');

      const sinPermiso = await peticion(
        'POST',
        RUTA_ESPERA,
        {
          nombreCliente: 'Gabriel Torres',
          telefonoContacto: '+52 999 111 2233',
          cantidadPersonas: 2,
        },
        'MESERO',
      );
      expect(sinPermiso.status).toBe(403);
      expect(sinPermiso.cuerpo.code).toBe('NO_AUTORIZADO');
    });
  });

  describe('PATCH /espera/{esperaId}/estado (RF-022, SPEC §4.3, §5.6)', () => {
    it('permite transicionar a Sentado o Cancelado y rechaza cambios posteriores desde estados terminales con 409', async () => {
      const creada = await peticion('POST', RUTA_ESPERA, {
        nombreCliente: 'David Campos',
        telefonoContacto: '+52 999 777 8899',
        cantidadPersonas: 4,
      });
      const esperaId = creada.cuerpo.esperaId as string;

      const sentado = await peticion('PATCH', `${RUTA_ESPERA}/${esperaId}/estado`, {
        estado: 'Sentado',
      });
      expect(sentado.status).toBe(200);
      expect(sentado.cuerpo.estado).toBe('Sentado');

      const intentoDesdeSentado = await peticion('PATCH', `${RUTA_ESPERA}/${esperaId}/estado`, {
        estado: 'Cancelado',
      });
      expect(intentoDesdeSentado.status).toBe(409);
      expect(intentoDesdeSentado.cuerpo).toMatchObject({
        statusCode: 409,
        code: 'TRANSICION_INVALIDA',
      });
    });

    it('permite devolver una entrada Notificado a En espera limpiando idMesaAsignada y responde 404 si no existe', async () => {
      const mesa = await crearMesaEnLimpiezaDb();
      const notificado = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Valeria Méndez',
          telefonoContacto: '+52 999 444 5566',
          cantidadPersonas: 4,
          estado: EstadoEspera.Notificado,
          mesaAsignadaId: mesa.id,
        },
      });

      const reencolado = await peticion('PATCH', `${RUTA_ESPERA}/${notificado.id}/estado`, {
        estado: 'En espera',
      });
      expect(reencolado.status).toBe(200);
      expect(reencolado.cuerpo).toMatchObject({
        esperaId: notificado.id,
        estado: 'En espera',
        idMesaAsignada: null,
      });

      const noExiste = await peticion('PATCH', `${RUTA_ESPERA}/${ESPERA_INEXISTENTE}/estado`, {
        estado: 'Cancelado',
      });
      expect(noExiste.status).toBe(404);
      expect(noExiste.cuerpo.code).toBe('ESPERA_NO_ENCONTRADA');
    });
  });

  describe('Flujo F4 · Fin de limpieza (Limpieza pendiente → Libre), asignación FIFO y WebSocket (RN-17, RF-020)', () => {
    it('T4.3 · al pasar una mesa a Libre, transiciona el cliente compatible más antiguo a Notificado y emite espera.mesa_disponible por WebSocket a recepción', async () => {
      const mesa = await crearMesaEnLimpiezaDb({ capacidad: 4 });

      // 1. Cliente más antiguo pero con 6 personas (no cabe en mesa de 4)
      const grupoGrande = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Familia grande',
          telefonoContacto: '+52 999 000 0001',
          cantidadPersonas: 6,
          horaLlegada: new Date('2030-01-15T11:40:00.000Z'),
          estado: EstadoEspera.En_espera,
        },
      });
      // 2. Cliente compatible más antiguo (3 personas <= 4) -> debe ser elegido en FIFO
      const primeroCompatible = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Gabriel Torres',
          telefonoContacto: '+52 999 111 2233',
          cantidadPersonas: 3,
          horaLlegada: new Date('2030-01-15T11:45:00.000Z'),
          estado: EstadoEspera.En_espera,
        },
      });
      // 3. Cliente compatible más reciente (2 personas <= 4) -> permanece En espera
      const segundoCompatible = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Ana López',
          telefonoContacto: '+52 999 333 4455',
          cantidadPersonas: 2,
          horaLlegada: new Date('2030-01-15T11:50:00.000Z'),
          estado: EstadoEspera.En_espera,
        },
      });

      const socketRecepcion = await conectarClienteRecepcion();
      const promesaEventoWs = new Promise<EsperaMesaDisponiblePayload>((resolve) => {
        socketRecepcion.once(SALA_WS_EVENTS.ESPERA_MESA_DISPONIBLE, resolve);
      });

      const respuesta = await peticion('PATCH', `${RUTA_MESAS}/${mesa.id}/estado`, {
        estado: 'Libre',
      });

      expect(respuesta.status).toBe(200);
      expect(respuesta.cuerpo).toEqual({ mesaId: mesa.id, estado: 'Libre' });

      const eventoWs = await promesaEventoWs;
      expect(eventoWs).toEqual({
        mesaId: mesa.id,
        esperaId: primeroCompatible.id,
        cliente: {
          nombre: 'Gabriel Torres',
          cantidadPersonas: 3,
        },
      });

      // La mesa permanece Libre (RN-17) y sólo primeroCompatible pasa a Notificado
      const mesaActualizada = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(mesaActualizada.estadoFisico).toBe(EstadoMesa.Libre);

      const e1 = await prisma.listaEspera.findUniqueOrThrow({
        where: { id: primeroCompatible.id },
      });
      expect(e1.estado).toBe(EstadoEspera.Notificado);
      expect(e1.mesaAsignadaId).toBe(mesa.id);

      const eGrande = await prisma.listaEspera.findUniqueOrThrow({ where: { id: grupoGrande.id } });
      expect(eGrande.estado).toBe(EstadoEspera.En_espera);

      const e2 = await prisma.listaEspera.findUniqueOrThrow({
        where: { id: segundoCompatible.id },
      });
      expect(e2.estado).toBe(EstadoEspera.En_espera);
    });

    it('liberar dos mesas compatibles simultáneamente notifica a dos clientes distintos en orden FIFO sin duplicados', async () => {
      const m1 = await crearMesaEnLimpiezaDb({ capacidad: 4 });
      const m2 = await crearMesaEnLimpiezaDb({ capacidad: 4 });

      const c1 = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Cliente 1',
          telefonoContacto: '+52 999 111 0001',
          cantidadPersonas: 2,
          horaLlegada: new Date('2030-01-15T11:30:00.000Z'),
          estado: EstadoEspera.En_espera,
        },
      });
      const c2 = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Cliente 2',
          telefonoContacto: '+52 999 111 0002',
          cantidadPersonas: 4,
          horaLlegada: new Date('2030-01-15T11:35:00.000Z'),
          estado: EstadoEspera.En_espera,
        },
      });

      const [r1, r2] = await Promise.all([
        peticion('PATCH', `${RUTA_MESAS}/${m1.id}/estado`, { estado: 'Libre' }),
        peticion('PATCH', `${RUTA_MESAS}/${m2.id}/estado`, { estado: 'Libre' }),
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      const notificados = await prisma.listaEspera.findMany({
        where: { estado: EstadoEspera.Notificado },
        orderBy: { horaLlegada: 'asc' },
      });
      expect(notificados.map((n) => n.id)).toEqual([c1.id, c2.id]);
      expect(new Set(notificados.map((n) => n.mesaAsignadaId))).toEqual(new Set([m1.id, m2.id]));
    });
  });
});
