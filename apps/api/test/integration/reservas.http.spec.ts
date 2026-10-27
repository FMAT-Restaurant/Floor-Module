import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoReserva as EstadoReservaPrisma, Prisma, PrismaClient } from '@prisma/client';
import { EVENT_TOPICS } from '@floor/shared';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';
import { Reloj } from '../../src/common/reloj/reloj';
import { ReservasCron } from '../../src/modules/reservas/reservas.cron';

/**
 * BE-007 · BE-008 · Pruebas de integración HTTP y proceso programado de /api/v1/floor/reservas
 * contra PostgreSQL 16 real (RF-012..RF-017b, RNF-003, SPEC §5.4, §6.1, §7 F2, RN-08..RN-11, RN-20).
 */
let ahoraIsoActual = '2030-01-15T12:00:00.000Z';
const RUTA = '/api/v1/floor/reservas';
const MESA_INEXISTENTE = 'a9999999-9999-4999-8999-999999999999';
const RESERVA_INEXISTENTE = 'b9999999-9999-4999-8999-999999999999';

const prisma = new PrismaClient();
let app: NestExpressApplication;
let reservasCron: ReservasCron;
let baseUrl: string;

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

type Json = Record<string, unknown>;

const HOST_USER_ID = 'e1000000-0000-4000-8000-000000000002';
const MESERO_USER_ID = 'b1000000-0000-4000-8000-000000000001';

async function peticion<T = Json>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  headersExtra: Record<string, string> = {},
): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-user-id': HOST_USER_ID,
      'x-user-roles': 'HOST',
      ...headersExtra,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: (texto ? JSON.parse(texto) : null) as T };
}

function crearMesaDb(datos: Partial<Prisma.MesaUncheckedCreateInput> & { numeroMesa: number }) {
  return prisma.mesa.create({ data: { capacidad: 4, zona: 'Principal', ...datos } });
}

describe('API /api/v1/floor/reservas (BE-007 · BE-008)', () => {
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

  describe('POST /api/v1/floor/reservas (RF-012, RN-09, RN-10, RNF-003)', () => {
    it('crea una reserva Confirmada (201) y genera el tstzrange [inicio, fin) en PostgreSQL', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });

      const { status, cuerpo } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Laura Pérez', tel: '+52 999 123 4567' },
      });

      expect(status).toBe(201);
      expect(cuerpo).toMatchObject({
        mesaId: mesa.id,
        estado: 'Confirmada',
      });
      expect(cuerpo.reservaId).toEqual(expect.any(String));

      const filasRango = await prisma.$queryRaw<{ rangoTexto: string }[]>`
        SELECT "rango"::text AS "rangoTexto"
        FROM "Reserva"
        WHERE "id_reserva" = ${cuerpo.reservaId}::uuid`;
      expect(filasRango[0]?.rangoTexto).toContain('2030-01-15 19:00:00+00');
      expect(filasRango[0]?.rangoTexto).toContain('2030-01-15 20:30:00+00');
    });

    it('T2.3 · RN-10: valida que cantidadPersonas sea > 0 y <= capacidad de la mesa seleccionada', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });

      const ceroPersonas = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 0,
        cliente: { nombre: 'Laura Pérez', tel: '+52 999 123 4567' },
      });
      expect(ceroPersonas.status).toBe(400);
      expect(ceroPersonas.cuerpo).toMatchObject({ code: 'VALIDACION' });

      const excesoCapacidad = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 5,
        cliente: { nombre: 'Laura Pérez', tel: '+52 999 123 4567' },
      });
      expect(excesoCapacidad.status).toBe(400);
      expect(excesoCapacidad.cuerpo).toMatchObject({
        code: 'VALIDACION',
        details: { mesaId: mesa.id, cantidadPersonas: 5, capacidad: 4 },
      });
    });

    it('responde 404 MESA_NO_ENCONTRADA si la mesa no existe o está inactiva', async () => {
      const inactiva = await crearMesaDb({ numeroMesa: 2, activo: false });

      const noExiste = await peticion('POST', RUTA, {
        mesaId: MESA_INEXISTENTE,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 60,
        cantidadPersonas: 2,
        cliente: { nombre: 'Ana', tel: '5512345678' },
      });
      const mesaBaja = await peticion('POST', RUTA, {
        mesaId: inactiva.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 60,
        cantidadPersonas: 2,
        cliente: { nombre: 'Ana', tel: '5512345678' },
      });

      expect(noExiste.status).toBe(404);
      expect(noExiste.cuerpo).toMatchObject({ code: 'MESA_NO_ENCONTRADA' });
      expect(mesaBaja.status).toBe(404);
    });

    it('T2.1 · RN-09: permite reservas contiguas [18:00, 19:30) y [19:30, 21:00) en la misma mesa', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });

      const primera = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '18:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente 1', tel: '5512345678' },
      });
      const segunda = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:30',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Cliente 2', tel: '5587654321' },
      });

      expect(primera.status).toBe(201);
      expect(segunda.status).toBe(201);
    });

    it('T2.2 · RN-09: rechaza reserva solapada [19:00, 20:30) sobre [18:00, 19:30) con 409 RESERVA_SOLAPADA', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });

      await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '18:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente 1', tel: '5512345678' },
      });

      const solapada = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente 2', tel: '5587654321' },
      });

      expect(solapada.status).toBe(409);
      expect(solapada.cuerpo).toMatchObject({
        statusCode: 409,
        code: 'RESERVA_SOLAPADA',
      });
    });

    it('RNF-003 · Concurrencia: ante reservas simultáneas sobre la misma mesa y horario, exactamente 1 pasa (201) y el resto retorna 409 RESERVA_SOLAPADA', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 10, capacidad: 6 });
      const payload = {
        mesaId: mesa.id,
        fecha: '2030-01-20',
        horaInicio: '20:00',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Reserva Concurrente', tel: '+52 999 111 2233' },
      };

      const respuestas = await Promise.all(
        Array.from({ length: 8 }, () => peticion('POST', RUTA, payload)),
      );

      const exitosas = respuestas.filter((r) => r.status === 201);
      const conflictivas = respuestas.filter((r) => r.status === 409);

      expect(exitosas).toHaveLength(1);
      expect(conflictivas).toHaveLength(7);
      for (const conflicto of conflictivas) {
        expect(conflicto.cuerpo).toMatchObject({
          statusCode: 409,
          code: 'RESERVA_SOLAPADA',
        });
      }

      const totalEnBd = await prisma.reserva.count({ where: { mesaId: mesa.id } });
      expect(totalEnBd).toBe(1);
    });
  });

  describe('GET /api/v1/floor/reservas/disponibilidad (RF-015)', () => {
    it('retorna únicamente las mesas activas con capacidad >= aforo y sin reservas Confirmada solapadas en esa franja', async () => {
      const mesaPequena = await crearMesaDb({ numeroMesa: 1, capacidad: 2, zona: 'Bar' });
      const mesaOcupadaEnFranja = await crearMesaDb({
        numeroMesa: 2,
        capacidad: 4,
        zona: 'Principal',
      });
      const mesaContiguaLibre = await crearMesaDb({
        numeroMesa: 3,
        capacidad: 4,
        zona: 'Principal',
      });
      const mesaConCancelada = await crearMesaDb({
        numeroMesa: 4,
        capacidad: 6,
        zona: 'Terraza',
      });
      await crearMesaDb({ numeroMesa: 5, capacidad: 8, zona: 'Terraza', activo: false });

      // Reserva que se solapa con [19:00, 20:30): [18:30, 20:00) en mesa 2
      await peticion('POST', RUTA, {
        mesaId: mesaOcupadaEnFranja.id,
        fecha: '2030-01-15',
        horaInicio: '18:30',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Ocupa Mesa 2', tel: '5511112222' },
      });

      // Reserva contigua que termina justo a las 19:00: [17:30, 19:00) en mesa 3 → NO se solapa
      await peticion('POST', RUTA, {
        mesaId: mesaContiguaLibre.id,
        fecha: '2030-01-15',
        horaInicio: '17:30',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Contigua Mesa 3', tel: '5533334444' },
      });

      // Reserva en el mismo horario pero Cancelada en mesa 4 → NO bloquea disponibilidad
      const creadaCancelable = await peticion('POST', RUTA, {
        mesaId: mesaConCancelada.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Cancelada Mesa 4', tel: '5555556666' },
      });
      await peticion('DELETE', `${RUTA}/${creadaCancelable.cuerpo.reservaId as string}`);

      // Consulta con parámetros estándar (fecha, horaInicio, duracion, personas)
      const dispEstandar = await peticion<Json[]>(
        'GET',
        `${RUTA}/disponibilidad?fecha=2030-01-15&horaInicio=19:00&duracion=90&personas=4`,
      );
      expect(dispEstandar.status).toBe(200);
      expect(dispEstandar.cuerpo.map((m) => m.numeroMesa)).toEqual([3, 4]);
      expect(dispEstandar.cuerpo.map((m) => m.mesaId)).not.toContain(mesaPequena.id);
      expect(dispEstandar.cuerpo.map((m) => m.mesaId)).not.toContain(mesaOcupadaEnFranja.id);

      // Consulta con alias de query params (fecha, hora, duracion, aforo)
      const dispAlias = await peticion<Json[]>(
        'GET',
        `${RUTA}/disponibilidad?fecha=2030-01-15&hora=19:00&duracion=90&aforo=2`,
      );
      expect(dispAlias.status).toBe(200);
      expect(dispAlias.cuerpo.map((m) => m.numeroMesa)).toEqual([1, 3, 4]);
    });
  });

  describe('PATCH y DELETE /api/v1/floor/reservas/:reservaId (RF-013, RF-014, RN-11)', () => {
    it('reprograma el horario de una reserva Confirmada y actualiza su rango temporal', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 6 });
      const { cuerpo: creada } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '18:00',
        duracion: 60,
        cantidadPersonas: 3,
        cliente: { nombre: 'Carlos Ruiz', tel: '5512345678' },
      });

      const { status, cuerpo } = await peticion('PATCH', `${RUTA}/${creada.reservaId as string}`, {
        horaInicio: '20:00',
        duracion: 120,
        cantidadPersonas: 5,
      });

      expect(status).toBe(200);
      expect(cuerpo).toMatchObject({
        reservaId: creada.reservaId,
        mesaId: mesa.id,
        horaInicio: '20:00',
        horaFin: '22:00',
        cantidadPersonas: 5,
        estado: 'Confirmada',
      });
    });

    it('rechaza reprogramar hacia una franja solapada en la misma mesa con 409 RESERVA_SOLAPADA', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });
      await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '18:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Reserva A', tel: '5511111111' },
      });
      const { cuerpo: reservaB } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '20:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Reserva B', tel: '5522222222' },
      });

      const intentoSolape = await peticion('PATCH', `${RUTA}/${reservaB.reservaId as string}`, {
        horaInicio: '19:00',
        duracion: 60,
      });

      expect(intentoSolape.status).toBe(409);
      expect(intentoSolape.cuerpo).toMatchObject({ code: 'RESERVA_SOLAPADA' });
    });

    it('cancela una reserva Confirmada con DELETE o POST /cancelar y libera el horario', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });
      const { cuerpo: creada } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Mario Gómez', tel: '5512345678' },
      });

      const cancelada = await peticion('DELETE', `${RUTA}/${creada.reservaId as string}`);
      expect(cancelada.status).toBe(200);
      expect(cancelada.cuerpo).toMatchObject({
        reservaId: creada.reservaId,
        estado: 'Cancelada',
      });

      // El horario queda libre para una nueva reserva en la misma mesa
      const nuevaEnMismoHorario = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Nuevo Cliente', tel: '5599998888' },
      });
      expect(nuevaEnMismoHorario.status).toBe(201);
    });

    it('RN-11: valida que la reserva no esté ya Completada o Cancelada antes de reprogramar o cancelar (409 TRANSICION_INVALIDA)', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });

      const { cuerpo: resCancelada } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '17:00',
        duracion: 60,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente Cancelado', tel: '5512345678' },
      });
      await peticion('POST', `${RUTA}/${resCancelada.reservaId as string}/cancelar`);

      const { cuerpo: resCompletada } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '21:00',
        duracion: 60,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente Completado', tel: '5587654321' },
      });
      await prisma.reserva.update({
        where: { id: resCompletada.reservaId as string },
        data: { estado: EstadoReservaPrisma.Completada },
      });

      // Intentar reprogramar o volver a cancelar la reserva Cancelada
      const patchCancelada = await peticion(
        'PATCH',
        `${RUTA}/${resCancelada.reservaId as string}`,
        { horaInicio: '18:00' },
      );
      const deleteCancelada = await peticion(
        'DELETE',
        `${RUTA}/${resCancelada.reservaId as string}`,
      );
      expect(patchCancelada.status).toBe(409);
      expect(patchCancelada.cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });
      expect(deleteCancelada.status).toBe(409);
      expect(deleteCancelada.cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });

      // Intentar reprogramar o cancelar la reserva Completada
      const patchCompletada = await peticion(
        'PATCH',
        `${RUTA}/${resCompletada.reservaId as string}`,
        { horaInicio: '22:00' },
      );
      const deleteCompletada = await peticion(
        'DELETE',
        `${RUTA}/${resCompletada.reservaId as string}`,
      );
      expect(patchCompletada.status).toBe(409);
      expect(patchCompletada.cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });
      expect(deleteCompletada.status).toBe(409);
      expect(deleteCompletada.cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });
    });

    it('responde 404 RESERVA_NO_ENCONTRADA cuando el reservaId no existe', async () => {
      const patchInexistente = await peticion('PATCH', `${RUTA}/${RESERVA_INEXISTENTE}`, {
        horaInicio: '20:00',
      });
      const deleteInexistente = await peticion('DELETE', `${RUTA}/${RESERVA_INEXISTENTE}`);

      expect(patchInexistente.status).toBe(404);
      expect(patchInexistente.cuerpo).toMatchObject({ code: 'RESERVA_NO_ENCONTRADA' });
      expect(deleteInexistente.status).toBe(404);
      expect(deleteInexistente.cuerpo).toMatchObject({ code: 'RESERVA_NO_ENCONTRADA' });
    });

    it('BLOQ-06 · SPEC §1.1: MESERO puede consultar GET /reservas (200) pero recibe 403 NO_AUTORIZADO al intentar POST /reservas o POST /reservas/:id/cancelar', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });
      const { cuerpo: creada } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente Host', tel: '5512345678' },
      });

      const headersMesero = {
        'x-user-id': MESERO_USER_ID,
        'x-user-roles': 'MESERO',
      };

      const consultaMesero = await peticion<Json[]>('GET', RUTA, undefined, headersMesero);
      expect(consultaMesero.status).toBe(200);
      expect(consultaMesero.cuerpo).toHaveLength(1);

      const postMesero = await peticion(
        'POST',
        RUTA,
        {
          mesaId: mesa.id,
          fecha: '2030-01-15',
          horaInicio: '21:00',
          duracion: 60,
          cantidadPersonas: 2,
          cliente: { nombre: 'Intento Mesero', tel: '5512345678' },
        },
        headersMesero,
      );
      expect(postMesero.status).toBe(403);
      expect(postMesero.cuerpo).toMatchObject({
        statusCode: 403,
        code: 'NO_AUTORIZADO',
      });

      const cancelarMesero = await peticion(
        'POST',
        `${RUTA}/${creada.reservaId as string}/cancelar`,
        undefined,
        headersMesero,
      );
      expect(cancelarMesero.status).toBe(403);
      expect(cancelarMesero.cuerpo).toMatchObject({
        statusCode: 403,
        code: 'NO_AUTORIZADO',
      });
    });
  });

  describe('BE-008 · POST /api/v1/floor/reservas/:reservaId/no-show y alertas cron (RF-016, RF-017b, RN-08, RN-11, RN-20)', () => {
    it('T2.4 · RF-017b · RN-11: marca una reserva Confirmada como No-show (200), libera la franja horaria y rechaza transiciones inválidas (404 / 409 / 403)', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 1, capacidad: 4 });
      const { cuerpo: creada } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Cliente No-show', tel: '5512345678' },
      });

      // MESERO no tiene permiso para marcar No-show (SPEC §1.1)
      const intentoMesero = await peticion(
        'POST',
        `${RUTA}/${creada.reservaId as string}/no-show`,
        undefined,
        {
          'x-user-id': MESERO_USER_ID,
          'x-user-roles': 'MESERO',
        },
      );
      expect(intentoMesero.status).toBe(403);
      expect(intentoMesero.cuerpo).toMatchObject({ code: 'NO_AUTORIZADO' });

      // HOST marca No-show exitosamente (200 OK)
      const marcadaNoShow = await peticion('POST', `${RUTA}/${creada.reservaId as string}/no-show`);
      expect(marcadaNoShow.status).toBe(200);
      expect(marcadaNoShow.cuerpo).toMatchObject({
        reservaId: creada.reservaId,
        mesaId: mesa.id,
        estado: 'No-show',
      });

      // Segundo intento sobre reserva ya en No-show retorna 409 TRANSICION_INVALIDA
      const segundoIntento = await peticion(
        'POST',
        `${RUTA}/${creada.reservaId as string}/no-show`,
      );
      expect(segundoIntento.status).toBe(409);
      expect(segundoIntento.cuerpo).toMatchObject({ code: 'TRANSICION_INVALIDA' });

      // Reserva inexistente retorna 404 RESERVA_NO_ENCONTRADA
      const noExiste = await peticion('POST', `${RUTA}/${RESERVA_INEXISTENTE}/no-show`);
      expect(noExiste.status).toBe(404);
      expect(noExiste.cuerpo).toMatchObject({ code: 'RESERVA_NO_ENCONTRADA' });

      // La franja horaria [19:00, 20:30) quedó liberada y permite una nueva reserva Confirmada
      const nuevaEnMismaFranja = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 90,
        cantidadPersonas: 2,
        cliente: { nombre: 'Cliente Reemplazo', tel: '5599998888' },
      });
      expect(nuevaEnMismaFranja.status).toBe(201);
    });

    it('RF-016 · RN-08 · RN-20: el cron detecta reservas en ventana de 30 minutos con alerta_emitida = false, publica sala.reserva.proxima_alerta en outbox y no genera duplicados', async () => {
      const mesa = await crearMesaDb({ numeroMesa: 7, capacidad: 4 });

      // Reserva 1: inicia a las 19:00 (entrará en ventana de 30 min cuando el reloj avance a 18:40)
      const { cuerpo: resEnVentana } = await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 60,
        cantidadPersonas: 3,
        cliente: { nombre: 'Sofía Alerta', tel: '5511223344' },
      });

      // Reserva 2: inicia a las 21:00 (fuera de ventana a las 18:40)
      await peticion('POST', RUTA, {
        mesaId: mesa.id,
        fecha: '2030-01-15',
        horaInicio: '21:00',
        duracion: 60,
        cantidadPersonas: 2,
        cliente: { nombre: 'Pedro Lejano', tel: '5566778899' },
      });

      // Avanzamos el reloj a las 18:40 UTC (faltan 20 minutos para las 19:00)
      ahoraIsoActual = '2030-01-15T18:40:00.000Z';

      const emitidasPrimeraVez = await reservasCron.checkReservasProximas();
      expect(emitidasPrimeraVez).toBe(1);

      const enBd = await prisma.reserva.findUnique({
        where: { id: resEnVentana.reservaId as string },
      });
      expect(enBd?.alertaEmitida).toBe(true);

      const eventosOutbox = await prisma.outboxEvento.findMany({
        where: { routingKey: EVENT_TOPICS.RESERVA_PROXIMA_ALERTA },
      });
      expect(eventosOutbox).toHaveLength(1);
      expect(eventosOutbox[0]?.payload).toEqual({
        reservaId: resEnVentana.reservaId,
        mesaId: mesa.id,
        nombreContacto: 'Sofía Alerta',
        horaInicio: '19:00',
        minutosRestantes: 20,
        timestamp: '2030-01-15T18:40:00.000Z',
      });

      // Segunda ejecución en la misma ventana: idempotente, no duplica alertas
      const emitidasSegundaVez = await reservasCron.checkReservasProximas();
      expect(emitidasSegundaVez).toBe(0);

      const totalEventosOutbox = await prisma.outboxEvento.count({
        where: { routingKey: EVENT_TOPICS.RESERVA_PROXIMA_ALERTA },
      });
      expect(totalEventosOutbox).toBe(1);
    });
  });
});
