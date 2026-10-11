import {
  createGatewayAuthHeaders,
  EstadoEspera,
  EstadoMesa,
  EstadoReserva,
  EstadoUnion,
  FIXTURE_AUTH_USERS,
  FIXTURE_MESA_IDS,
  FIXTURE_MESERO_IDS,
  FIXTURE_RESERVA_IDS,
  FIXTURE_UNION_IDS,
  RoleEnum,
  type AsignacionDto,
  type EsperaDto,
  type HealthDto,
  type MesaDto,
  type MesaEnVivoDto,
  type OcuparMesaResponseDto,
  type ReservaDto,
  type UnionDto,
} from '@floor/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockDb } from './db';
import { server } from './server';
import { mockSalaSimulation, registerWindowMockApi } from './simulation';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  mockDb.reset();
});

afterAll(() => {
  server.close();
});

describe('MSW Integration: REST Endpoints and Realistic Mock Responses', () => {
  describe('Mesas Endpoints (SPEC §5.1)', () => {
    it('GET /sala/mesas returns all active tables conforming to MesaDto[]', async () => {
      const res = await fetch('http://localhost:3000/sala/mesas');
      expect(res.status).toBe(200);
      const data: MesaDto[] = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((m) => m.activo)).toBe(true);
      expect(data[0]).toHaveProperty('numeroMesa');
      expect(data[0]).toHaveProperty('estadoFisico');
    });

    it('GET /sala/mesas with query params filters correctly', async () => {
      const res = await fetch(
        'http://localhost:3000/sala/mesas?zona=Terraza&estado=Limpieza+pendiente',
      );
      expect(res.status).toBe(200);
      const data: MesaDto[] = await res.json();
      expect(data.every((m) => m.zona === 'Terraza')).toBe(true);
      expect(data.every((m) => m.estadoFisico === EstadoMesa.LIMPIEZA_PENDIENTE)).toBe(true);
    });

    it('GET /sala/mesas/estado-en-vivo returns enriched tables with live attributes', async () => {
      const res = await fetch('http://localhost:3000/sala/mesas/estado-en-vivo');
      expect(res.status).toBe(200);
      const data: MesaEnVivoDto[] = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveProperty('tieneReservaProxima');
      expect(data[0]).toHaveProperty('ocupadaDesde');
      expect(data[0]).toHaveProperty('meseroId');
    });

    it('GET /sala/mesas/:mesaId returns specific table or 404', async () => {
      const resOk = await fetch(`http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}`);
      expect(resOk.status).toBe(200);
      const mesa: MesaDto = await resOk.json();
      expect(mesa.mesaId).toBe(FIXTURE_MESA_IDS.MESA_1);
      expect(mesa.numeroMesa).toBe(1);

      const res404 = await fetch(
        'http://localhost:3000/sala/mesas/00000000-0000-4000-8000-000000000099',
      );
      expect(res404.status).toBe(404);
      const err = await res404.json();
      expect(err.code).toBe('MESA_NO_ENCONTRADA');
    });

    it('POST /sala/mesas creates a table with 201 or rejects duplicates with 409', async () => {
      const newTable = {
        numeroMesa: 99,
        capacidad: 4,
        zona: 'Principal',
      };
      const res = await fetch('http://localhost:3000/sala/mesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTable),
      });
      expect(res.status).toBe(201);
      const created: MesaDto = await res.json();
      expect(created.numeroMesa).toBe(99);
      expect(created.estadoFisico).toBe(EstadoMesa.LIBRE);

      // Intento de duplicado debe responder 409
      const resDup = await fetch('http://localhost:3000/sala/mesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTable),
      });
      expect(resDup.status).toBe(409);
      const errDup = await resDup.json();
      expect(errDup.code).toBe('NUMERO_MESA_DUPLICADO');
    });

    it('PATCH /sala/mesas/:mesaId updates table attributes', async () => {
      const res = await fetch(`http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacidad: 8 }),
      });
      expect(res.status).toBe(200);
      const updated: MesaDto = await res.json();
      expect(updated.capacidad).toBe(8);
    });

    it('DELETE /sala/mesas/:mesaId performs logical deletion or fails on occupied table', async () => {
      const resDel = await fetch(`http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}`, {
        method: 'DELETE',
      });
      expect(resDel.status).toBe(204);

      // Intentar borrar mesa ocupada (MESA_3) responde 409
      const resFail = await fetch(`http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_3}`, {
        method: 'DELETE',
      });
      expect(resFail.status).toBe(409);
      const err = await resFail.json();
      expect(err.code).toBe('TRANSICION_INVALIDA');
    });
  });

  describe('Ciclo Operativo Endpoints (SPEC §5.2)', () => {
    it('POST /sala/mesas/:mesaId/ocupar requires forzarOcupacion if upcoming reservation present (RN-05)', async () => {
      // MESA_2 tiene reserva próxima
      const resBlock = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_2}/ocupar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comensales: 2,
            meseroId: FIXTURE_MESERO_IDS.CARLOS,
          }),
        },
      );
      expect(resBlock.status).toBe(409);
      const err = await resBlock.json();
      expect(err.code).toBe('RESERVA_PROXIMA_PRESENTE');

      // Con forzarOcupacion: true se permite
      const resAllow = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_2}/ocupar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comensales: 2,
            meseroId: FIXTURE_MESERO_IDS.CARLOS,
            forzarOcupacion: true,
          }),
        },
      );
      expect(resAllow.status).toBe(200);
      const data: OcuparMesaResponseDto = await resAllow.json();
      expect(data.estado).toBe(EstadoMesa.OCUPADA);
      expect(data.sessionId).toBeDefined();
    });

    it('POST /sala/mesas/:mesaId/ocupar requires forzarSobrecupo if comensales > capacidad', async () => {
      // MESA_1 tiene capacidad 2
      const resOver = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/ocupar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comensales: 5,
            meseroId: FIXTURE_MESERO_IDS.CARLOS,
          }),
        },
      );
      expect(resOver.status).toBe(409);
      const err = await resOver.json();
      expect(err.code).toBe('SOBRECUPO_DETECTADO');

      // Con forzarSobrecupo: true se autoriza
      const resOk = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/ocupar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comensales: 5,
            meseroId: FIXTURE_MESERO_IDS.CARLOS,
            forzarSobrecupo: true,
          }),
        },
      );
      expect(resOk.status).toBe(200);
      const data: OcuparMesaResponseDto = await resOk.json();
      expect(data.estado).toBe(EstadoMesa.OCUPADA);
      expect(data.advertencias).toBeDefined();
    });

    it('PATCH /sala/mesas/:mesaId/estado transitions Ocupada -> Limpieza pendiente -> Libre', async () => {
      // MESA_3 está Ocupada -> pasa a Limpieza pendiente
      const resLimpieza = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_3}/estado`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: EstadoMesa.LIMPIEZA_PENDIENTE }),
        },
      );
      expect(resLimpieza.status).toBe(200);
      const body1 = await resLimpieza.json();
      expect(body1.estado).toBe(EstadoMesa.LIMPIEZA_PENDIENTE);

      // Limpieza pendiente -> pasa a Libre
      const resLibre = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_3}/estado`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: EstadoMesa.LIBRE }),
        },
      );
      expect(resLibre.status).toBe(200);
      const body2 = await resLibre.json();
      expect(body2.estado).toBe(EstadoMesa.LIBRE);

      // Transición inválida directa Libre -> Limpieza pendiente responde 409
      const resInvalida = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_3}/estado`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: EstadoMesa.LIMPIEZA_PENDIENTE }),
        },
      );
      expect(resInvalida.status).toBe(409);
      const err = await resInvalida.json();
      expect(err.code).toBe('TRANSICION_INVALIDA');
    });
  });

  describe('Meseros y Asignaciones (SPEC §5.3)', () => {
    it('PUT /sala/mesas/:mesaId/mesero creates assignment and GET /sala/asignaciones retrieves it', async () => {
      const resPut = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/mesero`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meseroId: FIXTURE_MESERO_IDS.ANA }),
        },
      );
      expect(resPut.status).toBe(200);
      const asignacion: AsignacionDto = await resPut.json();
      expect(asignacion.meseroId).toBe(FIXTURE_MESERO_IDS.ANA);
      expect(asignacion.activo).toBe(true);

      const resList = await fetch(
        `http://localhost:3000/sala/asignaciones?meseroId=${FIXTURE_MESERO_IDS.ANA}`,
      );
      expect(resList.status).toBe(200);
      const lista: AsignacionDto[] = await resList.json();
      expect(lista.some((a) => a.mesaId === FIXTURE_MESA_IDS.MESA_1 && a.activo)).toBe(true);
    });

    it('PUT /sala/mesas/:mesaId/mesero rejects non-UUID meseroId with 400 VALIDATION_ERROR', async () => {
      const res = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/mesero`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meseroId: 'mesero-invalido-123' }),
        },
      );
      expect(res.status).toBe(400);
      const err = await res.json();
      expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('PUT /sala/mesas/:mesaId/mesero with unknown UUID meseroId returns 404 MESERO_NO_ENCONTRADO', async () => {
      const res = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/mesero`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meseroId: '00000000-0000-4000-8000-000000000099' }),
        },
      );
      expect(res.status).toBe(404);
      const err = await res.json();
      expect(err.code).toBe('MESERO_NO_ENCONTRADO');
    });
  });

  describe('Reservas Endpoints (SPEC §5.4)', () => {
    it('POST /sala/reservas creates reservation or responds 409 on overlap (RN-09)', async () => {
      const resOk = await fetch('http://localhost:3000/sala/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesaId: FIXTURE_MESA_IDS.MESA_7,
          fecha: '2026-10-11',
          horaInicio: '18:00',
          duracion: 60,
          cantidadPersonas: 2,
          cliente: {
            nombre: 'Fernanda Ortiz',
            tel: '+52 999 555 1234',
          },
        }),
      });
      expect(resOk.status).toBe(201);
      const nueva = await resOk.json();
      expect(nueva.estado).toBe(EstadoReserva.CONFIRMADA);

      // Intento de reserva solapada en la misma mesa responde 409
      const resSolapada = await fetch('http://localhost:3000/sala/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesaId: FIXTURE_MESA_IDS.MESA_7,
          fecha: '2026-10-11',
          horaInicio: '18:30',
          duracion: 60,
          cantidadPersonas: 2,
          cliente: {
            nombre: 'Pedro Cruz',
            tel: '+52 999 444 3210',
          },
        }),
      });
      expect(resSolapada.status).toBe(409);
      const err = await resSolapada.json();
      expect(err.code).toBe('RESERVA_SOLAPADA');
    });

    it('GET /sala/reservas/disponibilidad returns free compatible tables', async () => {
      const res = await fetch(
        'http://localhost:3000/sala/reservas/disponibilidad?fecha=2026-10-11&horaInicio=14:00&duracion=90&personas=4',
      );
      expect(res.status).toBe(200);
      const disponibles: MesaDto[] = await res.json();
      expect(Array.isArray(disponibles)).toBe(true);
      // Mesa 2 tiene reserva a las 14:00, no debe aparecer
      expect(disponibles.some((m) => m.mesaId === FIXTURE_MESA_IDS.MESA_2)).toBe(false);
    });

    it('POST /sala/reservas/:id/cancelar and no-show transition reservation correctly', async () => {
      // Cancelar reserva 1
      const resCancel = await fetch(
        `http://localhost:3000/sala/reservas/${FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA}/cancelar`,
        { method: 'POST' },
      );
      expect(resCancel.status).toBe(200);
      const cancelada: ReservaDto = await resCancel.json();
      expect(cancelada.estado).toBe(EstadoReserva.CANCELADA);

      // Marcar reserva 2 como no-show
      const resNoShow = await fetch(
        `http://localhost:3000/sala/reservas/${FIXTURE_RESERVA_IDS.RESERVA_2_FUTURA}/no-show`,
        { method: 'POST' },
      );
      expect(resNoShow.status).toBe(200);
      const noShow: ReservaDto = await resNoShow.json();
      expect(noShow.estado).toBe(EstadoReserva.NO_SHOW);
    });
  });

  describe('Uniones Endpoints (SPEC §5.5)', () => {
    it('POST /sala/mesas/uniones enforces same zone (RN-12) and creates union', async () => {
      // Intento de unir mesas de distintas zonas (Principal vs Terraza) responde 409
      const resIncomp = await fetch('http://localhost:3000/sala/mesas/uniones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesasIds: [FIXTURE_MESA_IDS.MESA_1, FIXTURE_MESA_IDS.MESA_4],
          totalPersonas: 4,
          meseroId: FIXTURE_MESERO_IDS.CARLOS,
        }),
      });
      expect(resIncomp.status).toBe(409);
      const err = await resIncomp.json();
      expect(err.code).toBe('ZONA_INCOMPATIBLE');

      // Unir mesas libres de la misma zona con forzarOcupacion si una tiene reserva próxima
      const resOk = await fetch('http://localhost:3000/sala/mesas/uniones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesasIds: [FIXTURE_MESA_IDS.MESA_1, FIXTURE_MESA_IDS.MESA_2],
          totalPersonas: 4,
          meseroId: FIXTURE_MESERO_IDS.CARLOS,
          forzarOcupacion: true,
        }),
      });
      expect(resOk.status).toBe(201);
      const union = await resOk.json();
      expect(union.estado).toBe(EstadoMesa.OCUPADA);
      expect(union.unionId).toBeDefined();

      // Liberar unión
      const resLib = await fetch(
        `http://localhost:3000/sala/mesas/uniones/${union.unionId}/liberar`,
        {
          method: 'POST',
        },
      );
      expect(resLib.status).toBe(200);
      const libData = await resLib.json();
      expect(libData.estado).toBe(EstadoMesa.LIMPIEZA_PENDIENTE);
    });

    it('GET /sala/mesas/uniones lists active unions', async () => {
      const res = await fetch('http://localhost:3000/sala/mesas/uniones?estado=Activa');
      expect(res.status).toBe(200);
      const list: UnionDto[] = await res.json();
      expect(list.some((u) => u.unionId === FIXTURE_UNION_IDS.UNION_1)).toBe(true);
      expect(list.every((u) => u.estado === EstadoUnion.ACTIVA)).toBe(true);
    });
  });

  describe('Lista de Espera Endpoints (SPEC §5.6)', () => {
    it('POST /sala/espera, GET /sala/espera and PATCH /sala/espera/:id/estado work correctly', async () => {
      const resPost = await fetch('http://localhost:3000/sala/espera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreCliente: 'Andrea Solís',
          telefonoContacto: '+52 999 000 1122',
          cantidadPersonas: 3,
        }),
      });
      expect(resPost.status).toBe(201);
      const nueva: EsperaDto = await resPost.json();
      expect(nueva.estado).toBe(EstadoEspera.EN_ESPERA);

      // GET lista
      const resGet = await fetch('http://localhost:3000/sala/espera');
      expect(resGet.status).toBe(200);
      const lista: EsperaDto[] = await resGet.json();
      expect(lista.some((e) => e.esperaId === nueva.esperaId)).toBe(true);

      // Actualizar estado a Sentado
      const resPatch = await fetch(`http://localhost:3000/sala/espera/${nueva.esperaId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: EstadoEspera.SENTADO }),
      });
      expect(resPatch.status).toBe(200);
      const sentada: EsperaDto = await resPatch.json();
      expect(sentada.estado).toBe(EstadoEspera.SENTADO);
    });
  });

  describe('Operación Endpoint (SPEC §5.7)', () => {
    it('GET /health returns 200 with status ok and healthy components', async () => {
      const res = await fetch('http://localhost:3000/health');
      expect(res.status).toBe(200);
      const data: HealthDto = await res.json();
      expect(data.status).toBe('ok');
      expect(data.db).toBe('up');
      expect(data.broker).toBe('up');
    });
  });

  describe('Simulación y Eventos WebSocket (SPEC §6.2)', () => {
    it('mockSalaSimulation emits mesa.estado_actualizado and triggers listeners', () => {
      const listener = vi.fn();
      const unsubscribe = mockSalaSimulation.onMesaEstadoActualizado(listener);

      const payload = mockSalaSimulation.simulateMesaEstadoTransition(
        FIXTURE_MESA_IDS.MESA_4,
        EstadoMesa.LIBRE,
      );

      expect(listener).toHaveBeenCalledWith(payload);
      expect(payload.mesaId).toBe(FIXTURE_MESA_IDS.MESA_4);
      expect(payload.estado).toBe(EstadoMesa.LIBRE);

      unsubscribe();
    });

    it('mockSalaSimulation emits reserva.proxima_alerta and triggers listeners', () => {
      const listener = vi.fn();
      const unsubscribe = mockSalaSimulation.onReservaProximaAlerta(listener);

      const payload = mockSalaSimulation.simulateUpcomingReservationAlert(
        FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA,
      );

      expect(listener).toHaveBeenCalledWith(payload);
      expect(payload.reservaId).toBe(FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA);
      expect(payload.horaInicio).toBe('14:00');

      unsubscribe();
    });

    it('mockSalaSimulation emits espera.mesa_disponible alert', () => {
      const listener = vi.fn();
      const unsubscribe = mockSalaSimulation.onEsperaMesaDisponible(listener);

      const payload = mockSalaSimulation.simulateWaitingTableAlert(FIXTURE_MESA_IDS.MESA_1);

      expect(listener).toHaveBeenCalledWith(payload);
      expect(payload.mesaId).toBe(FIXTURE_MESA_IDS.MESA_1);
      expect(payload.cliente.nombre).toBeDefined();

      unsubscribe();
    });

    it('registerWindowMockApi attaches simulation and db helpers to window', () => {
      registerWindowMockApi();
      expect(window.__FLOOR_MOCK__).toBeDefined();
      expect(typeof window.__FLOOR_MOCK__?.simulateTableState).toBe('function');
      expect(typeof window.__FLOOR_MOCK__?.simulateUpcomingReservationAlert).toBe('function');
      expect(typeof window.__FLOOR_MOCK__?.simulateWaitingTableAlert).toBe('function');
      expect(typeof window.__FLOOR_MOCK__?.resetDatabase).toBe('function');
      expect(typeof window.__FLOOR_MOCK__?.getDbState).toBe('function');
      expect(typeof window.__FLOOR_MOCK__?.setAuth).toBe('function');
      expect(typeof window.__FLOOR_MOCK__?.getAuth).toBe('function');
    });
  });

  describe('Gateway Auth Headers & Authorization Matrix (SPEC §1 & §1.1)', () => {
    it('requests with valid Gateway headers succeed', async () => {
      const headers = createGatewayAuthHeaders(FIXTURE_AUTH_USERS.ADMIN);
      const res = await fetch('http://localhost:3000/sala/mesas', { headers });
      expect(res.status).toBe(200);
    });

    it('requests with invalid x-user-id return 401 NO_AUTENTICADO', async () => {
      const res = await fetch('http://localhost:3000/sala/mesas', {
        headers: {
          'x-user-id': 'invalid-uuid-format',
          'x-staff-id': 'ADMIN',
          'x-user-roles': 'ADMINISTRADOR',
        },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('NO_AUTENTICADO');
    });

    it('requests with invalid x-staff-id return 401 NO_AUTENTICADO', async () => {
      const res = await fetch('http://localhost:3000/sala/mesas', {
        headers: {
          'x-user-id': FIXTURE_AUTH_USERS.ADMIN.userId,
          'x-staff-id': 'bad_staff_code',
          'x-user-roles': 'ADMINISTRADOR',
        },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('NO_AUTENTICADO');
    });

    it('requests with x-password-temporary: true return 403 PASSWORD_CHANGE_REQUIRED', async () => {
      const headers = createGatewayAuthHeaders(FIXTURE_AUTH_USERS.ADMIN, {
        passwordTemporary: true,
      });
      const res = await fetch('http://localhost:3000/sala/mesas', { headers });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('MESERO role is forbidden from performing table CRUD (403 NO_AUTORIZADO)', async () => {
      const headers = createGatewayAuthHeaders(FIXTURE_AUTH_USERS.MESERO_CARLOS);
      const res = await fetch('http://localhost:3000/sala/mesas', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroMesa: 99, capacidad: 4, zona: 'Terraza' }),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('NO_AUTORIZADO');
    });

    it('MESERO role cannot assign waiters, while HOST role can', async () => {
      const meseroHeaders = createGatewayAuthHeaders(FIXTURE_AUTH_USERS.MESERO_CARLOS);
      const resForbidden = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/mesero`,
        {
          method: 'PUT',
          headers: { ...meseroHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ meseroId: FIXTURE_MESERO_IDS.ANA }),
        },
      );
      expect(resForbidden.status).toBe(403);

      const hostHeaders = createGatewayAuthHeaders(FIXTURE_AUTH_USERS.HOST);
      const resOk = await fetch(
        `http://localhost:3000/sala/mesas/${FIXTURE_MESA_IDS.MESA_1}/mesero`,
        {
          method: 'PUT',
          headers: { ...hostHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ meseroId: FIXTURE_MESERO_IDS.ANA }),
        },
      );
      expect(resOk.status).toBe(200);
    });

    it('returns 401 NO_AUTENTICADO when mockDb has no authenticated user and no headers sent', async () => {
      mockDb.setMockAuth(null);
      const res = await fetch('http://localhost:3000/sala/mesas');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('NO_AUTENTICADO');
    });

    it('mockSalaSimulation.setAuth switches active mock role', async () => {
      mockSalaSimulation.setAuth(RoleEnum.MESERO);
      expect(mockDb.getMockAuth()?.roles).toBe(RoleEnum.MESERO);

      const resForbidden = await fetch('http://localhost:3000/sala/mesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroMesa: 98, capacidad: 4, zona: 'Terraza' }),
      });
      expect(resForbidden.status).toBe(403);

      mockSalaSimulation.setAuth(RoleEnum.ADMINISTRADOR);
      expect(mockDb.getMockAuth()?.roles).toBe(RoleEnum.ADMINISTRADOR);
    });
  });
});
