import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoMesa, Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';
import { Reloj } from '../../src/common/reloj/reloj';

/**
 * BE-001 · Pruebas HTTP de /sala/mesas contra PostgreSQL real (RF-001–RF-004, RF-023,
 * RN-08, RN-15, RN-18, RN-19). El reloj se fija para que RN-08 sea determinista.
 */
const AHORA_ISO = '2030-01-15T12:00:00.000Z';
const RUTA = '/sala/mesas';
const MESERO_ID = 'b1000000-0000-4000-8000-000000000001';
const MESA_INEXISTENTE = 'a9999999-9999-4999-8999-999999999999';

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

function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> & { numeroMesa: number }) {
  return prisma.mesa.create({ data: { capacidad: 4, zona: 'Principal', ...datos } });
}

/** Inserta una reserva a N minutos de "ahora" sin depender de la zona horaria del servidor. */
async function insertarReserva(
  mesaId: string,
  minutosDesdeAhora: number,
  estado: 'Confirmada' | 'Cancelada' = 'Confirmada',
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "Reserva"
      ("id_mesa","nombre_contacto","telefono_contacto","cantidad_personas",
       "fecha_reserva","hora_inicio","hora_fin","estado")
    SELECT ${mesaId}::uuid, 'Ana Pérez', '5512345678', 2,
           ini::date, ini::time, (ini + interval '30 minutes')::time, ${estado}::"EstadoReserva"
    FROM (
      SELECT (${AHORA_ISO}::timestamptz + make_interval(mins => ${minutosDesdeAhora}::int))
             AT TIME ZONE current_setting('TimeZone') AS ini
    ) t`;
}

describe('API /sala/mesas (BE-001)', () => {
  beforeAll(async () => {
    delete process.env.RESERVA_PROXIMA_VENTANA_MINUTOS;
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => new Date(AHORA_ISO) })
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

  describe('POST /sala/mesas (RF-001, RN-19)', () => {
    it('crea la mesa en estado Libre y responde 201 con MesaDto', async () => {
      const { status, cuerpo } = await peticion('POST', RUTA, {
        numeroMesa: 12,
        capacidad: 6,
        zona: 'Terraza',
      });

      expect(status).toBe(201);
      expect(cuerpo).toMatchObject({
        numeroMesa: 12,
        capacidad: 6,
        zona: 'Terraza',
        estadoFisico: 'Libre',
        unionId: null,
        activo: true,
      });
      expect(cuerpo.mesaId).toEqual(expect.any(String));
    });

    it('RN-19: un número duplicado entre mesas activas responde 409 NUMERO_MESA_DUPLICADO', async () => {
      await crearMesaDb({ numeroMesa: 5 });

      const { status, cuerpo } = await peticion('POST', RUTA, {
        numeroMesa: 5,
        capacidad: 4,
        zona: 'Bar',
      });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'NUMERO_MESA_DUPLICADO' });
    });

    it('RN-19: permite reutilizar el número de una mesa dada de baja', async () => {
      await crearMesaDb({ numeroMesa: 5, activo: false });

      const { status } = await peticion('POST', RUTA, { numeroMesa: 5, capacidad: 4, zona: 'Bar' });

      expect(status).toBe(201);
    });

    it('SPEC §9: dos altas simultáneas del mismo número dan un 201 y un 409, nunca 500', async () => {
      const cuerpo = { numeroMesa: 21, capacidad: 4, zona: 'Principal' };

      const [a, b] = await Promise.all([
        peticion('POST', RUTA, cuerpo),
        peticion('POST', RUTA, cuerpo),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    it.each([
      ['capacidad menor a 1', { numeroMesa: 1, capacidad: 0, zona: 'Bar' }],
      ['zona vacía', { numeroMesa: 1, capacidad: 2, zona: '   ' }],
      [
        'propiedad desconocida',
        { numeroMesa: 1, capacidad: 2, zona: 'Bar', estadoFisico: 'Ocupada' },
      ],
    ])('SPEC §8: %s responde 400 VALIDACION', async (_caso, cuerpo) => {
      const respuesta = await peticion('POST', RUTA, cuerpo);

      expect(respuesta.status).toBe(400);
      expect(respuesta.cuerpo).toMatchObject({ statusCode: 400, code: 'VALIDACION' });
    });

    it('SPEC §1: un JSON mal formado responde 400 y no 500', async () => {
      const respuesta = await fetch(`${baseUrl}${RUTA}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"numeroMesa":',
      });

      expect(respuesta.status).toBe(400);
    });

    it('SPEC §1: un cuerpo mayor a 64 KB responde 413 PAYLOAD_DEMASIADO_GRANDE', async () => {
      const { status, cuerpo } = await peticion('POST', RUTA, {
        numeroMesa: 1,
        capacidad: 2,
        zona: 'x'.repeat(70_000),
      });

      expect(status).toBe(413);
      expect(cuerpo).toMatchObject({ code: 'PAYLOAD_DEMASIADO_GRANDE' });
    });
  });

  describe('GET /sala/mesas y /sala/mesas/{mesaId} (RF-004)', () => {
    it('lista sólo las mesas activas, ordenadas por número', async () => {
      await crearMesaDb({ numeroMesa: 2 });
      await crearMesaDb({ numeroMesa: 1 });
      await crearMesaDb({ numeroMesa: 3, activo: false });

      const { status, cuerpo } = await peticion<Json[]>('GET', RUTA);

      expect(status).toBe(200);
      expect(cuerpo.map((m) => m.numeroMesa)).toEqual([1, 2]);
    });

    it('incluirInactivas=true incluye las mesas dadas de baja', async () => {
      await crearMesaDb({ numeroMesa: 1 });
      await crearMesaDb({ numeroMesa: 2, activo: false });

      const { cuerpo } = await peticion<Json[]>('GET', `${RUTA}?incluirInactivas=true`);

      expect(cuerpo).toHaveLength(2);
    });

    it('filtra por zona y por estado físico', async () => {
      await crearMesaDb({ numeroMesa: 1, zona: 'Bar' });
      await crearMesaDb({ numeroMesa: 2, zona: 'Terraza' });
      await crearMesaDb({
        numeroMesa: 3,
        zona: 'Terraza',
        estadoFisico: EstadoMesa.Limpieza_pendiente,
      });

      const porZona = await peticion<Json[]>('GET', `${RUTA}?zona=Terraza`);
      const porEstado = await peticion<Json[]>(
        'GET',
        `${RUTA}?estado=${encodeURIComponent('Limpieza pendiente')}`,
      );

      expect(porZona.cuerpo.map((m) => m.numeroMesa)).toEqual([2, 3]);
      expect(porEstado.cuerpo.map((m) => m.numeroMesa)).toEqual([3]);
      expect(porEstado.cuerpo[0].estadoFisico).toBe('Limpieza pendiente');
    });

    it('devuelve una mesa por id', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 4 });

      const { status, cuerpo } = await peticion('GET', `${RUTA}/${mesa.id}`);

      expect(status).toBe(200);
      expect(cuerpo).toMatchObject({ mesaId: mesa.id, numeroMesa: 4 });
    });

    it('responde 404 MESA_NO_ENCONTRADA si no existe o está inactiva', async () => {
      const inactiva = await crearMesaDb({ numeroMesa: 4, activo: false });

      const inexistente = await peticion('GET', `${RUTA}/${MESA_INEXISTENTE}`);
      const baja = await peticion('GET', `${RUTA}/${inactiva.id}`);

      expect(inexistente.status).toBe(404);
      expect(inexistente.cuerpo).toMatchObject({ code: 'MESA_NO_ENCONTRADA' });
      expect(baja.status).toBe(404);
    });

    it('SPEC §8: un id que no es UUID responde 400', async () => {
      const { status, cuerpo } = await peticion('GET', `${RUTA}/no-es-un-uuid`);

      expect(status).toBe(400);
      expect(cuerpo).toMatchObject({ code: 'VALIDACION' });
    });

    it('una ruta inexistente responde 404 con el formato de error estándar', async () => {
      const { status, cuerpo } = await peticion('GET', '/sala/ruta-inexistente');

      expect(status).toBe(404);
      expect(cuerpo).toMatchObject({ statusCode: 404, code: 'NO_ENCONTRADO' });
    });
  });

  describe('PATCH /sala/mesas/{mesaId} (RF-002, RN-15, RN-19)', () => {
    it('actualiza los campos enviados', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      const { status, cuerpo } = await peticion('PATCH', `${RUTA}/${mesa.id}`, {
        capacidad: 8,
        zona: 'Salón',
      });

      expect(status).toBe(200);
      expect(cuerpo).toMatchObject({ numeroMesa: 1, capacidad: 8, zona: 'Salón' });
    });

    it('un cuerpo vacío responde 400', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      const { status } = await peticion('PATCH', `${RUTA}/${mesa.id}`, {});

      expect(status).toBe(400);
    });

    it('responde 404 si la mesa no existe', async () => {
      const { status } = await peticion('PATCH', `${RUTA}/${MESA_INEXISTENTE}`, { capacidad: 2 });

      expect(status).toBe(404);
    });

    it('RN-19: cambiar a un número usado por otra mesa activa responde 409', async () => {
      await crearMesaDb({ numeroMesa: 1 });
      const mesa = await crearMesaDb({ numeroMesa: 2 });

      const { status, cuerpo } = await peticion('PATCH', `${RUTA}/${mesa.id}`, { numeroMesa: 1 });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'NUMERO_MESA_DUPLICADO' });
    });

    it('rechaza una mesa ocupada con 409 MESA_NO_DISPONIBLE', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, estadoFisico: EstadoMesa.Ocupada });

      const { status, cuerpo } = await peticion('PATCH', `${RUTA}/${mesa.id}`, { capacidad: 2 });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'MESA_NO_DISPONIBLE' });
    });

    it('RN-15: rechaza una mesa en unión con 409 MESA_EN_UNION', async () => {
      const union = await prisma.unionMesa.create({ data: { zona: 'Principal' } });
      const mesa = await crearMesaDb({
        numeroMesa: 1,
        estadoFisico: EstadoMesa.Ocupada,
        unionMesaId: union.id,
      });

      const { status, cuerpo } = await peticion('PATCH', `${RUTA}/${mesa.id}`, { capacidad: 2 });

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'MESA_EN_UNION' });
    });
  });

  describe('DELETE /sala/mesas/{mesaId} (RF-003, RN-18)', () => {
    it('da de baja lógica una mesa libre: 204 y la fila se conserva con activo=false', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });

      const { status } = await peticion('DELETE', `${RUTA}/${mesa.id}`);

      expect(status).toBe(204);
      const fila = await prisma.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
      expect(fila.activo).toBe(false);
    });

    it('responde 404 si la mesa no existe o ya está de baja', async () => {
      const baja = await crearMesaDb({ numeroMesa: 1, activo: false });

      const inexistente = await peticion('DELETE', `${RUTA}/${MESA_INEXISTENTE}`);
      const yaBaja = await peticion('DELETE', `${RUTA}/${baja.id}`);

      expect(inexistente.status).toBe(404);
      expect(yaBaja.status).toBe(404);
    });

    it.each([EstadoMesa.Ocupada, EstadoMesa.Limpieza_pendiente])(
      'rechaza una mesa en estado %s con 409 TRANSICION_INVALIDA',
      async (estadoFisico) => {
        const mesa = await crearMesaDb({ numeroMesa: 1, estadoFisico });

        const { status, cuerpo } = await peticion('DELETE', `${RUTA}/${mesa.id}`);

        expect(status).toBe(409);
        expect(cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });
      },
    );

    it('RN-15: rechaza una mesa en unión con 409 MESA_EN_UNION', async () => {
      const union = await prisma.unionMesa.create({ data: { zona: 'Principal' } });
      const mesa = await crearMesaDb({ numeroMesa: 1, unionMesaId: union.id });

      const { status, cuerpo } = await peticion('DELETE', `${RUTA}/${mesa.id}`);

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({ code: 'MESA_EN_UNION' });
    });

    it('RN-18: rechaza una mesa con una reserva Confirmada pendiente', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });
      await insertarReserva(mesa.id, 120);

      const { status, cuerpo } = await peticion('DELETE', `${RUTA}/${mesa.id}`);

      expect(status).toBe(409);
      expect(cuerpo).toMatchObject({
        code: 'TRANSICION_INVALIDA',
        details: { motivo: 'RESERVAS_CONFIRMADAS' },
      });
    });

    it('RN-18: una reserva Cancelada no impide la baja', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1 });
      await insertarReserva(mesa.id, 120, 'Cancelada');

      const { status } = await peticion('DELETE', `${RUTA}/${mesa.id}`);

      expect(status).toBe(204);
    });
  });

  describe('GET /sala/mesas/estado-en-vivo (RF-023, RN-08)', () => {
    it('responde 200 y no confunde "estado-en-vivo" con un mesaId', async () => {
      const { status, cuerpo } = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);

      expect(status).toBe(200);
      expect(cuerpo).toEqual([]);
    });

    it('RN-08: tieneReservaProxima sólo para reservas Confirmada dentro de [ahora, ahora + 30 min]', async () => {
      const proxima = await crearMesaDb({ numeroMesa: 1 });
      const lejana = await crearMesaDb({ numeroMesa: 2 });
      const cancelada = await crearMesaDb({ numeroMesa: 3 });
      const pasada = await crearMesaDb({ numeroMesa: 4 });
      await insertarReserva(proxima.id, 10);
      await insertarReserva(lejana.id, 45);
      await insertarReserva(cancelada.id, 10, 'Cancelada');
      await insertarReserva(pasada.id, -5);

      const { status, cuerpo } = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);

      expect(status).toBe(200);
      expect(cuerpo.map((m) => [m.numeroMesa, m.tieneReservaProxima])).toEqual([
        [1, true],
        [2, false],
        [3, false],
        [4, false],
      ]);
    });

    it('incluye ocupadaDesde en ISO-8601 UTC y el mesero con asignación activa', async () => {
      const ocupadaDesde = new Date('2030-01-15T11:15:00.000Z');
      const mesa = await crearMesaDb({
        numeroMesa: 1,
        estadoFisico: EstadoMesa.Ocupada,
        ocupadaDesde,
      });
      await prisma.asignacionMesero.create({
        data: { mesaId: mesa.id, meseroId: MESERO_ID, fechaHoraInicio: ocupadaDesde },
      });
      await crearMesaDb({ numeroMesa: 2 });

      const { cuerpo } = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);

      expect(cuerpo[0]).toMatchObject({
        numeroMesa: 1,
        estadoFisico: 'Ocupada',
        ocupadaDesde: '2030-01-15T11:15:00.000Z',
        meseroId: MESERO_ID,
        tieneReservaProxima: false,
      });
      expect(cuerpo[1]).toMatchObject({ ocupadaDesde: null, meseroId: null });
    });

    it('no incluye mesas dadas de baja', async () => {
      await crearMesaDb({ numeroMesa: 1 });
      await crearMesaDb({ numeroMesa: 2, activo: false });

      const { cuerpo } = await peticion<Json[]>('GET', `${RUTA}/estado-en-vivo`);

      expect(cuerpo.map((m) => m.numeroMesa)).toEqual([1]);
    });
  });
});
