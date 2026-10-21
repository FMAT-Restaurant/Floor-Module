import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoMesa, Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';

/**
 * BE-002 · PATCH /sala/mesas/{mesaId}/estado contra PostgreSQL real
 * (RF-006, RF-007, RN-06, RN-07, RN-15) y códigos de error 409 (SPEC §5.2).
 */
const RUTA = '/sala/mesas';
const MESA_INEXISTENTE = 'a9999999-9999-4999-8999-999999999999';
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
): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: (texto ? JSON.parse(texto) : null) as T };
}

function cambiarEstado(mesaId: string, cuerpo: unknown) {
  return peticion('PATCH', `${RUTA}/${mesaId}/estado`, cuerpo);
}

function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> = {}) {
  return prisma.mesa.create({
    data: { numeroMesa: 1, capacidad: 4, zona: 'Principal', ...datos },
  });
}

function crearMesaOcupadaDb() {
  return crearMesaDb({ estadoFisico: EstadoMesa.Ocupada, ocupadaDesde: OCUPADA_DESDE });
}

describe('PATCH /sala/mesas/{mesaId}/estado (BE-002)', () => {
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
});
