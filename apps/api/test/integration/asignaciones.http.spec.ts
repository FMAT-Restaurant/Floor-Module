import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';
import { Reloj } from '../../src/common/reloj/reloj';

/**
 * BE-003 · Pruebas HTTP y transaccionales de PUT /sala/mesas/:mesaId/mesero
 * y GET /sala/asignaciones contra PostgreSQL real (RF-010, RF-011, RN-16, SPEC §5.3).
 */
const T1_ISO = '2030-01-15T12:00:00.000Z';
const T2_ISO = '2030-01-15T13:30:00.000Z';
const MESERO_1 = 'd1000000-0000-4000-8000-000000000001';
const MESERO_2 = 'd1000000-0000-4000-8000-000000000002';
const MESA_INEXISTENTE = 'a9999999-9999-4999-8999-999999999999';
const UUID_V1_INVALIDO = '11111111-1111-1111-8111-111111111111';

const prisma = new PrismaClient();
let app: NestExpressApplication;
let baseUrl: string;
let instanteActual = new Date(T1_ISO);

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

type Json = Record<string, unknown>;

async function peticion<T = Json>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: (texto ? JSON.parse(texto) : null) as T };
}

function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> & { numeroMesa: number }) {
  return prisma.mesa.create({ data: { capacidad: 4, zona: 'Principal', ...datos } });
}

describe('API /sala/mesas/:mesaId/mesero y /sala/asignaciones (BE-003)', () => {
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => instanteActual })
      .compile();
    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    await prisma.$connect();
  });

  beforeEach(async () => {
    instanteActual = new Date(T1_ISO);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Reserva","AsignacionMesero","ListaEspera","Mesa","UnionMesa","outbox_evento" CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('PUT /sala/mesas/:mesaId/mesero (RF-010, RF-011, RN-16)', () => {
    it('RF-010: asigna inicialmente un mesero a una mesa activa y responde 200 con AsignacionDto', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      const { status, cuerpo } = await peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, {
        meseroId: MESERO_1,
      });

      expect(status).toBe(200);
      expect(cuerpo).toMatchObject({
        mesaId: mesa.id,
        meseroId: MESERO_1,
        fechaHoraInicio: T1_ISO,
        fechaHoraFin: null,
        activo: true,
      });
      expect(cuerpo.asignacionId).toEqual(expect.any(String));
    });

    it('RF-011 · RN-16: reasignar cierra la asignación previa y crea la nueva en la misma transacción', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      const inicial = await peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, {
        meseroId: MESERO_1,
      });
      instanteActual = new Date(T2_ISO);
      const reasignada = await peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, {
        meseroId: MESERO_2,
      });

      expect(inicial.status).toBe(200);
      expect(reasignada.status).toBe(200);
      expect(reasignada.cuerpo).toMatchObject({
        mesaId: mesa.id,
        meseroId: MESERO_2,
        fechaHoraInicio: T2_ISO,
        fechaHoraFin: null,
        activo: true,
      });

      const filas = await prisma.asignacionMesero.findMany({
        where: { mesaId: mesa.id },
        orderBy: { fechaHoraInicio: 'asc' },
      });
      expect(filas).toHaveLength(2);
      expect(filas[0]).toMatchObject({
        id: inicial.cuerpo.asignacionId,
        meseroId: MESERO_1,
        activo: false,
        fechaHoraFin: new Date(T2_ISO),
      });
      expect(filas[1]).toMatchObject({
        id: reasignada.cuerpo.asignacionId,
        meseroId: MESERO_2,
        activo: true,
        fechaHoraFin: null,
      });
    });

    it('RN-16: dos reasignaciones concurrentes sobre la misma mesa dejan exactamente una asignación activa', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      const [r1, r2] = await Promise.all([
        peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, { meseroId: MESERO_1 }),
        peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, { meseroId: MESERO_2 }),
      ]);

      expect([r1.status, r2.status]).toEqual([200, 200]);
      const activas = await prisma.asignacionMesero.findMany({
        where: { mesaId: mesa.id, activo: true },
      });
      expect(activas).toHaveLength(1);
    });

    it('refleja el mesero asignado y reasignado en GET /sala/mesas/estado-en-vivo', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      await peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, { meseroId: MESERO_1 });
      const enVivo1 = await peticion<Json[]>('GET', '/sala/mesas/estado-en-vivo');
      expect(enVivo1.cuerpo[0]).toMatchObject({ mesaId: mesa.id, meseroId: MESERO_1 });

      instanteActual = new Date(T2_ISO);
      await peticion('PUT', `/sala/mesas/${mesa.id}/mesero`, { meseroId: MESERO_2 });
      const enVivo2 = await peticion<Json[]>('GET', '/sala/mesas/estado-en-vivo');
      expect(enVivo2.cuerpo[0]).toMatchObject({ mesaId: mesa.id, meseroId: MESERO_2 });
    });

    it('responde 404 MESA_NO_ENCONTRADA si la mesa no existe o fue dada de baja lógica', async () => {
      const inactiva = await crearMesaDb({ numeroMesa: 1, activo: false });

      const noExiste = await peticion('PUT', `/sala/mesas/${MESA_INEXISTENTE}/mesero`, {
        meseroId: MESERO_1,
      });
      const dadaDeBaja = await peticion('PUT', `/sala/mesas/${inactiva.id}/mesero`, {
        meseroId: MESERO_1,
      });

      expect(noExiste.status).toBe(404);
      expect(noExiste.cuerpo).toMatchObject({ code: 'MESA_NO_ENCONTRADA' });
      expect(dadaDeBaja.status).toBe(404);
      expect(dadaDeBaja.cuerpo).toMatchObject({ code: 'MESA_NO_ENCONTRADA' });
    });

    it.each([
      ['mesaId no es UUID', 'no-es-un-uuid', { meseroId: MESERO_1 }],
      ['meseroId vacío', MESA_INEXISTENTE, { meseroId: '' }],
      ['meseroId no es UUID', MESA_INEXISTENTE, { meseroId: 'mesero-1' }],
      ['meseroId es UUID v1 y no v4', MESA_INEXISTENTE, { meseroId: UUID_V1_INVALIDO }],
      ['propiedad desconocida en body', MESA_INEXISTENTE, { meseroId: MESERO_1, extra: true }],
    ])('SPEC §8: %s responde 400 VALIDACION', async (_caso, mesaId, cuerpo) => {
      const respuesta = await peticion('PUT', `/sala/mesas/${mesaId}/mesero`, cuerpo);

      expect(respuesta.status).toBe(400);
      expect(respuesta.cuerpo).toMatchObject({ statusCode: 400, code: 'VALIDACION' });
    });
  });

  describe('GET /sala/asignaciones (RF-011, SPEC §5.3)', () => {
    it('lista por defecto sólo las asignaciones activas (activo = true) ordenadas por fechaHoraInicio DESC', async () => {
      const mesa1 = await crearMesaDb({ numeroMesa: 1 });
      const mesa2 = await crearMesaDb({ numeroMesa: 2 });

      await peticion('PUT', `/sala/mesas/${mesa1.id}/mesero`, { meseroId: MESERO_1 });
      instanteActual = new Date(T2_ISO);
      // Reasignar mesa1 (deja una inactiva de MESERO_1 y una activa de MESERO_2) y asignar mesa2
      await peticion('PUT', `/sala/mesas/${mesa1.id}/mesero`, { meseroId: MESERO_2 });
      await peticion('PUT', `/sala/mesas/${mesa2.id}/mesero`, { meseroId: MESERO_1 });

      const { status, cuerpo } = await peticion<Json[]>('GET', '/sala/asignaciones');

      expect(status).toBe(200);
      expect(cuerpo).toHaveLength(2);
      expect(cuerpo.every((a) => a.activo === true)).toBe(true);
    });

    it('filtra por meseroId y por activo=false', async () => {
      const mesa1 = await crearMesaDb({ numeroMesa: 1 });
      const mesa2 = await crearMesaDb({ numeroMesa: 2 });

      await peticion('PUT', `/sala/mesas/${mesa1.id}/mesero`, { meseroId: MESERO_1 });
      instanteActual = new Date(T2_ISO);
      await peticion('PUT', `/sala/mesas/${mesa1.id}/mesero`, { meseroId: MESERO_2 });
      await peticion('PUT', `/sala/mesas/${mesa2.id}/mesero`, { meseroId: MESERO_1 });

      const activasMesero1 = await peticion<Json[]>(
        'GET',
        `/sala/asignaciones?meseroId=${MESERO_1}`,
      );
      const inactivasMesero1 = await peticion<Json[]>(
        'GET',
        `/sala/asignaciones?meseroId=${MESERO_1}&activo=false`,
      );

      expect(activasMesero1.status).toBe(200);
      expect(activasMesero1.cuerpo).toHaveLength(1);
      expect(activasMesero1.cuerpo[0]).toMatchObject({
        mesaId: mesa2.id,
        meseroId: MESERO_1,
        activo: true,
      });

      expect(inactivasMesero1.status).toBe(200);
      expect(inactivasMesero1.cuerpo).toHaveLength(1);
      expect(inactivasMesero1.cuerpo[0]).toMatchObject({
        mesaId: mesa1.id,
        meseroId: MESERO_1,
        activo: false,
        fechaHoraFin: T2_ISO,
      });
    });

    it.each([
      ['meseroId no es UUID', 'meseroId=no-es-uuid'],
      ['meseroId es UUID v1', `meseroId=${UUID_V1_INVALIDO}`],
      ['activo inválido', 'activo=no-booleano'],
    ])('SPEC §8: query inválida (%s) responde 400 VALIDACION', async (_caso, query) => {
      const { status, cuerpo } = await peticion('GET', `/sala/asignaciones?${query}`);

      expect(status).toBe(400);
      expect(cuerpo).toMatchObject({ statusCode: 400, code: 'VALIDACION' });
    });
  });
});
