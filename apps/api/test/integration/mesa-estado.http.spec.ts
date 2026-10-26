import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoEspera, EstadoMesa, EstadoReserva, Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configurarApp, PREFIJO_GLOBAL } from '../../src/app.setup';
import { Reloj } from '../../src/common/reloj/reloj';

/**
 * BE-002 & BE-006 · PATCH /mesas/{mesaId}/estado y POST /mesas/{mesaId}/ocupar contra PostgreSQL real
 * (RF-005..RF-008, RF-017, RN-01..RN-07, RN-15, RN-16) y contratos SPEC §5.2.
 */
const RUTA = `/${PREFIJO_GLOBAL}/mesas`;
const MESA_INEXISTENTE = 'a9999999-9999-4999-8999-999999999999';
const MESERO_AUTENTICADO = 'e1000000-0000-4000-8000-000000000001';
const MESERO_ASIGNADO = 'e2000000-0000-4000-8000-000000000002';
const AHORA_FIJO = new Date('2030-01-15T12:00:00.000Z');
const OCUPADA_DESDE = new Date('2030-01-15T11:15:00.000Z');

const prisma = new PrismaClient();
let app: NestExpressApplication;
let baseUrl: string;

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

type Json = Record<string, unknown>;

async function peticion<T = Json>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  cabecerasExtra: Record<string, string> = {},
): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-user-id': MESERO_AUTENTICADO,
      'x-staff-id': 'HOST-01',
      'x-user-roles': 'HOST',
      ...cabecerasExtra,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: (texto ? JSON.parse(texto) : null) as T };
}

function cambiarEstado(mesaId: string, cuerpo: unknown) {
  return peticion('PATCH', `${RUTA}/${mesaId}/estado`, cuerpo);
}

function ocuparMesaHttp(
  mesaId: string,
  cuerpo: unknown,
  cabecerasExtra: Record<string, string> = {},
) {
  return peticion('POST', `${RUTA}/${mesaId}/ocupar`, cuerpo, cabecerasExtra);
}

function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> = {}) {
  return prisma.mesa.create({
    data: { numeroMesa: 1, capacidad: 4, zona: 'Principal', ...datos },
  });
}

function crearMesaOcupadaDb() {
  return crearMesaDb({ estadoFisico: EstadoMesa.Ocupada, ocupadaDesde: OCUPADA_DESDE });
}

describe('PATCH /mesas/{mesaId}/estado y POST /mesas/{mesaId}/ocupar (BE-002 / BE-006)', () => {
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

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('transiciones permitidas', () => {
    it('RN-06: Ocupada → Limpieza pendiente responde 200 y limpia ocupadaDesde', async () => {
      const mesa = await crearMesaOcupadaDb();

      const { status, cuerpo } = await cambiarEstado(mesa.id, { estado: 'Limpieza pendiente' });

      expect(status).toBe(200);
      expect(cuerpo).toEqual({ mesaId: mesa.id, estado: 'Limpieza pendiente' });
      const fila = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(fila.estadoFisico).toBe(EstadoMesa.Limpieza_pendiente);
      expect(fila.ocupadaDesde).toBeNull();
    });

    it('RN-07: Limpieza pendiente → Libre responde 200', async () => {
      const mesa = await crearMesaDb({ estadoFisico: EstadoMesa.Limpieza_pendiente });

      const { status, cuerpo } = await cambiarEstado(mesa.id, { estado: 'Libre' });

      expect(status).toBe(200);
      expect(cuerpo).toEqual({ mesaId: mesa.id, estado: 'Libre' });
      const fila = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(fila.estadoFisico).toBe(EstadoMesa.Libre);
    });

    it('el ciclo completo Ocupada → Limpieza pendiente → Libre se refleja en estado-en-vivo', async () => {
      const mesa = await crearMesaOcupadaDb();

      await cambiarEstado(mesa.id, { estado: 'Limpieza pendiente' });
      const enLimpieza = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);
      await cambiarEstado(mesa.id, { estado: 'Libre' });
      const libre = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);

      expect(enLimpieza.cuerpo[0]).toMatchObject({
        estadoFisico: 'Limpieza pendiente',
        ocupadaDesde: null,
      });
      expect(libre.cuerpo[0]).toMatchObject({ estadoFisico: 'Libre', ocupadaDesde: null });
    });
  });

  describe('RN-07 · transiciones no permitidas → 409 TRANSICION_INVALIDA', () => {
    it('Libre → Limpieza pendiente (el ejemplo del issue)', async () => {
      const mesa = await crearMesaDb();

      const { status, cuerpo } = await cambiarEstado(mesa.id, { estado: 'Limpieza pendiente' });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({
        statusCode: 409,
        code: 'TRANSICION_INVALIDA',
        details: { desde: 'Libre', hacia: 'Limpieza pendiente', permitidas: [] },
      });
    });

    it('Ocupada → Libre (no se puede saltar la limpieza)', async () => {
      const mesa = await crearMesaOcupadaDb();

      const { status, cuerpo } = await cambiarEstado(mesa.id, { estado: 'Libre' });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({
        code: 'TRANSICION_INVALIDA',
        details: { permitidas: ['Limpieza pendiente'] },
      });
      const fila = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(fila.estadoFisico).toBe(EstadoMesa.Ocupada);
    });

    it.each([
      ['Libre', 'Libre', EstadoMesa.Libre],
      ['Limpieza pendiente', 'Limpieza pendiente', EstadoMesa.Limpieza_pendiente],
    ])('pedir el mismo estado (%s) también es inválido', async (_nombre, estado, estadoFisico) => {
      const mesa = await crearMesaDb({ estadoFisico });

      const { status, cuerpo } = await cambiarEstado(mesa.id, { estado });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });
    });

    it('dos peticiones simultáneas Ocupada → Limpieza dan un 200 y un 409, nunca 500', async () => {
      const mesa = await crearMesaOcupadaDb();
      const cuerpo = { estado: 'Limpieza pendiente' };

      const [a, b] = await Promise.all([
        cambiarEstado(mesa.id, cuerpo),
        cambiarEstado(mesa.id, cuerpo),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });
  });

  describe('RN-15 · mesa en unión → 409 MESA_EN_UNION', () => {
    it('rechaza una transición que sería válida y no modifica la mesa', async () => {
      const union = await prisma.unionMesa.create({ data: { zona: 'Principal' } });
      const mesa = await crearMesaDb({
        estadoFisico: EstadoMesa.Ocupada,
        ocupadaDesde: OCUPADA_DESDE,
        unionMesaId: union.id,
      });

      const { status, cuerpo } = await cambiarEstado(mesa.id, { estado: 'Limpieza pendiente' });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'MESA_EN_UNION' });
      const fila = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(fila.estadoFisico).toBe(EstadoMesa.Ocupada);
    });

    it('tiene prioridad sobre TRANSICION_INVALIDA', async () => {
      const union = await prisma.unionMesa.create({ data: { zona: 'Principal' } });
      const mesa = await crearMesaDb({ unionMesaId: union.id });

      const { cuerpo } = await cambiarEstado(mesa.id, { estado: 'Limpieza pendiente' });

      expect(cuerpo).toMatchObject({ code: 'MESA_EN_UNION' });
    });
  });

  describe('validación y recursos inexistentes', () => {
    it.each([
      ['Ocupada (no se ocupa por este endpoint, RN-04)', { estado: 'Ocupada' }],
      ['un estado inventado', { estado: 'Rota' }],
      ['cuerpo vacío', {}],
      ['propiedad desconocida', { estado: 'Libre', activo: false }],
    ])('SPEC §8: %s responde 400 VALIDACION', async (_caso, cuerpo) => {
      const mesa = await crearMesaOcupadaDb();

      const respuesta = await cambiarEstado(mesa.id, cuerpo);

      expect(respuesta.status).toBe(400);
      expect(respuesta.cuerpo).toMatchObject({ statusCode: 400, code: 'VALIDACION' });
    });

    it('un mesaId que no es UUID responde 400', async () => {
      const { status } = await cambiarEstado('no-es-un-uuid', { estado: 'Libre' });

      expect(status).toBe(400);
    });

    it('una mesa inexistente responde 404 MESA_NO_ENCONTRADA', async () => {
      const { status, cuerpo } = await cambiarEstado(MESA_INEXISTENTE, { estado: 'Libre' });

      expect(status).toBe(404);
      expect(cuerpo).toMatchObject({ code: 'MESA_NO_ENCONTRADA' });
    });

    it('una mesa dada de baja se trata como inexistente', async () => {
      const mesa = await crearMesaDb({ activo: false, estadoFisico: EstadoMesa.Ocupada });

      const { status } = await cambiarEstado(mesa.id, { estado: 'Limpieza pendiente' });

      expect(status).toBe(404);
    });
  });

  describe('POST /api/v1/floor/mesas/{mesaId}/ocupar (BE-006)', () => {
    it('BLOQ-01, BLOQ-04 e IMP-01: ocupa una mesa Libre, registra AsignacionMesero reflejada en estado-en-vivo y encola ambos eventos con payload de dominio puro', async () => {
      const mesa = await crearMesaDb({ capacidad: 4 });

      const { status, cuerpo } = await ocuparMesaHttp(mesa.id, {
        comensales: 3,
        meseroId: MESERO_ASIGNADO,
      });

      expect(status).toBe(200);
      expect(cuerpo).toEqual({
        mesaId: mesa.id,
        estado: 'Ocupada',
        sessionId: expect.any(String),
      });

      const fila = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(fila.estadoFisico).toBe(EstadoMesa.Ocupada);
      expect(fila.ocupadaDesde).toEqual(AHORA_FIJO);

      // IMP-01: Verificar registro en AsignacionMesero reflejado en GET /mesas/estado-en-vivo
      const enVivo = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);
      expect(enVivo.status).toBe(200);
      expect(enVivo.cuerpo[0]).toMatchObject({
        mesaId: mesa.id,
        estadoFisico: 'Ocupada',
        meseroId: MESERO_ASIGNADO,
      });

      // BLOQ-01 & BLOQ-04: Ambos eventos en outbox_evento con payload de dominio puro
      const eventos = await prisma.outboxEvento.findMany({ orderBy: { creadoEn: 'asc' } });
      expect(eventos).toHaveLength(2);

      const evDining = eventos.find((e) => e.routingKey === 'sala.dining_session.iniciada');
      const evEstado = eventos.find((e) => e.routingKey === 'sala.mesa.estado_actualizado');
      expect(evDining).toBeDefined();
      expect(evEstado).toBeDefined();

      expect(evDining?.payload).toEqual({
        sessionId: cuerpo.sessionId,
        mesaId: mesa.id,
        unionId: null,
        meseroId: MESERO_ASIGNADO,
        comensales: 3,
        numComensales: 3,
        timestamp: AHORA_FIJO.toISOString(),
      });

      expect(evEstado?.payload).toEqual({
        mesaId: mesa.id,
        estado: 'Ocupada',
        unionId: null,
        timestamp: AHORA_FIJO.toISOString(),
      });
    });

    it('responde 409 SOBRECUPO_DETECTADO cuando comensales supera capacidad sin forzarSobrecupo', async () => {
      const mesa = await crearMesaDb({ capacidad: 4 });

      const { status, cuerpo } = await ocuparMesaHttp(mesa.id, { comensales: 6 });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({
        statusCode: 409,
        code: 'SOBRECUPO_DETECTADO',
      });
      const totalEventos = await prisma.outboxEvento.count();
      expect(totalEventos).toBe(0);
    });

    it('IMP-02 y BLOQ-03: responde 409 RESERVA_PROXIMA_PRESENTE con details de la reserva y devuelve advertencias al forzar ocupación y sobrecupo', async () => {
      const mesa = await crearMesaDb({ capacidad: 4 });
      const reservaProxima = await prisma.reserva.create({
        data: {
          mesaId: mesa.id,
          nombreContacto: 'Laura Gómez',
          telefonoContacto: '9991112233',
          cantidadPersonas: 4,
          fechaReserva: new Date('2030-01-15T00:00:00.000Z'),
          horaInicio: new Date('1970-01-01T12:20:00.000Z'),
          horaFin: new Date('1970-01-01T14:20:00.000Z'),
          estado: EstadoReserva.Confirmada,
        },
      });

      // Sin forzarOcupacion -> 409 con details de la reserva (IMP-02)
      const rechazo = await ocuparMesaHttp(mesa.id, { comensales: 4 });
      expect(rechazo.status).toBe(409);
      expect(rechazo.cuerpo).toMatchObject({
        statusCode: 409,
        code: 'RESERVA_PROXIMA_PRESENTE',
        details: {
          mesaId: mesa.id,
          reservaId: reservaProxima.id,
          nombreContacto: 'Laura Gómez',
          horaInicio: '12:20',
          cantidadPersonas: 4,
        },
      });

      // Con forzarOcupacion y forzarSobrecupo -> 200 OK con advertencias (BLOQ-03)
      const forzada = await ocuparMesaHttp(mesa.id, {
        comensales: 6,
        forzarOcupacion: true,
        forzarSobrecupo: true,
      });
      expect(forzada.status).toBe(200);
      expect(forzada.cuerpo).toEqual({
        mesaId: mesa.id,
        estado: 'Ocupada',
        sessionId: expect.any(String),
        advertencias: [
          expect.stringMatching(/Sobrecupo forzado/i),
          expect.stringMatching(/Ocupación forzada con reserva próxima/i),
        ],
      });
    });

    it('BLOQ-02 e IMP-02: al ocupar pasando reservaId exime esa reserva del bloqueo RN-05 y la transiciona a Completada', async () => {
      const mesa = await crearMesaDb({ capacidad: 4 });
      const reserva = await prisma.reserva.create({
        data: {
          mesaId: mesa.id,
          nombreContacto: 'Pedro Infante',
          telefonoContacto: '9994445566',
          cantidadPersonas: 4,
          fechaReserva: new Date('2030-01-15T00:00:00.000Z'),
          horaInicio: new Date('1970-01-01T12:15:00.000Z'),
          horaFin: new Date('1970-01-01T14:15:00.000Z'),
          estado: EstadoReserva.Confirmada,
        },
      });

      const { status, cuerpo } = await ocuparMesaHttp(mesa.id, {
        comensales: 4,
        reservaId: reserva.id,
      });

      expect(status).toBe(200);
      expect(cuerpo).toEqual({
        mesaId: mesa.id,
        estado: 'Ocupada',
        sessionId: expect.any(String),
      });

      const reservaActualizada = await prisma.reserva.findUniqueOrThrow({
        where: { id: reserva.id },
      });
      expect(reservaActualizada.estado).toBe(EstadoReserva.Completada);
    });

    it('BLOQ-02: al ocupar pasando esperaId transiciona ListaEspera a Sentado y rechaza si reservaId y esperaId se envían juntos', async () => {
      const mesa = await crearMesaDb({ capacidad: 4 });
      const espera = await prisma.listaEspera.create({
        data: {
          nombreCliente: 'Familia Domínguez',
          telefonoContacto: '9997778899',
          cantidadPersonas: 3,
          estado: EstadoEspera.Notificado,
        },
      });

      // Exclusión mutua reservaId + esperaId -> 400 VALIDACION
      const mutuo = await ocuparMesaHttp(mesa.id, {
        comensales: 3,
        reservaId: 'b1000000-0000-4000-8000-000000000002',
        esperaId: espera.id,
      });
      expect(mutuo.status).toBe(400);
      expect(mutuo.cuerpo).toMatchObject({
        statusCode: 400,
        code: 'VALIDACION',
      });

      // Ocupar con esperaId -> 200 OK y ListaEspera pasa a Sentado con mesaAsignadaId
      const ok = await ocuparMesaHttp(mesa.id, {
        comensales: 3,
        esperaId: espera.id,
      });
      expect(ok.status).toBe(200);

      const esperaActualizada = await prisma.listaEspera.findUniqueOrThrow({
        where: { id: espera.id },
      });
      expect(esperaActualizada.estado).toBe(EstadoEspera.Sentado);
      expect(esperaActualizada.mesaAsignadaId).toBe(mesa.id);
    });
  });
});
