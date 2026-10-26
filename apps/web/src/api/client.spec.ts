import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError, buildUrl, isApiError, setBaseUrl, setSessionToken } from './index';
import { queryClient } from './queryClient';
import {
  cambiarEstadoMesa,
  crearMesa,
  getMesa,
  getMesas,
  getMesasEnVivo,
  ocuparMesa,
} from './services/mesas.service';
import {
  cancelarReserva,
  crearReserva,
  getReservas,
  noShowReserva,
  verificarDisponibilidad,
} from './services/reservas.service';
import { crearUnion, getUniones, liberarUnion } from './services/uniones.service';
import { cambiarEstadoEspera, getListaEspera, registrarEspera } from './services/espera.service';
import { mockDb } from '../mocks/db';
import { server } from '../mocks/server';
import {
  EstadoEspera,
  EstadoMesa,
  EstadoReserva,
  FIXTURE_MESA_IDS,
  FIXTURE_MESERO_IDS,
  FIXTURE_RESERVA_IDS,
  FIXTURE_UNION_IDS,
} from '@floor/shared';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  vi.useRealTimers();
  server.resetHandlers();
  mockDb.reset();
  setSessionToken(null);
  setBaseUrl(null);
});

afterAll(() => {
  server.close();
});

describe('API Client Unit Tests & Error Handling', () => {
  describe('Correlation ID & Headers Injection', () => {
    it('automatically generates and injects x-correlation-id in outgoing requests', async () => {
      let receivedCorrelationId: string | null = null;

      server.use(
        http.get('*/test-correlation', ({ request }) => {
          receivedCorrelationId = request.headers.get('x-correlation-id');
          return HttpResponse.json({ ok: true });
        }),
      );

      const data = await apiClient.get<{ ok: boolean }>('http://localhost:3000/test-correlation');
      expect(data).toEqual({ ok: true });
      expect(receivedCorrelationId).toBeDefined();
      expect(typeof receivedCorrelationId).toBe('string');
      expect((receivedCorrelationId as unknown as string).length).toBeGreaterThan(10);
    });

    it('preserves existing x-correlation-id if explicitly provided in headers', async () => {
      let receivedCorrelationId: string | null = null;
      const customCorrelationId = 'custom-test-correlation-id-12345';

      server.use(
        http.get('*/test-custom-correlation', ({ request }) => {
          receivedCorrelationId = request.headers.get('x-correlation-id');
          return HttpResponse.json({ ok: true });
        }),
      );

      await apiClient.get<{ ok: boolean }>('http://localhost:3000/test-custom-correlation', {
        headers: { 'x-correlation-id': customCorrelationId },
      });

      expect(receivedCorrelationId).toBe(customCorrelationId);
    });

    it('injects Authorization Bearer token when session token is active', async () => {
      let receivedAuthHeader: string | null = null;
      const testToken = 'mock-jwt-token-abcdef123456';
      setSessionToken(testToken);

      server.use(
        http.get('*/test-auth', ({ request }) => {
          receivedAuthHeader = request.headers.get('authorization');
          return HttpResponse.json({ authenticated: true });
        }),
      );

      const res = await apiClient.get<{ authenticated: boolean }>(
        'http://localhost:3000/test-auth',
      );
      expect(res).toEqual({ authenticated: true });
      expect(receivedAuthHeader).toBe(`Bearer ${testToken}`);
    });

    it('injects Content-Type application/json when request body is provided', async () => {
      let receivedContentType: string | null = null;

      server.use(
        http.post('*/test-content-type', ({ request }) => {
          receivedContentType = request.headers.get('content-type');
          return HttpResponse.json({ created: true });
        }),
      );

      await apiClient.post<{ created: boolean }>('http://localhost:3000/test-content-type', {
        name: 'test',
      });
      expect(receivedContentType).toContain('application/json');
    });
  });

  describe('HTTP Methods and Response Handling', () => {
    it('processes 200 / 201 successful responses with typed parsed JSON', async () => {
      server.use(
        http.get('*/test-ok', () => {
          return HttpResponse.json({ message: 'Éxito' }, { status: 200 });
        }),
        http.post('*/test-created', () => {
          return HttpResponse.json({ id: 'uuid-123', status: 'created' }, { status: 201 });
        }),
      );

      const getRes = await apiClient.get<{ message: string }>('http://localhost:3000/test-ok');
      expect(getRes).toEqual({ message: 'Éxito' });

      const postRes = await apiClient.post<{ id: string; status: string }>(
        'http://localhost:3000/test-created',
        { data: 1 },
      );
      expect(postRes).toEqual({ id: 'uuid-123', status: 'created' });
    });

    it('processes 204 No Content returning undefined without JSON parse error', async () => {
      server.use(
        http.delete('*/test-no-content', () => {
          return new HttpResponse(null, { status: 204 });
        }),
      );

      const delRes = await apiClient.delete<void>('http://localhost:3000/test-no-content');
      expect(delRes).toBeUndefined();
    });

    it('serializes query parameters properly in buildUrl', () => {
      setBaseUrl('/sala');
      const url = buildUrl('/mesas', { zona: 'Terraza', activo: true });
      expect(url).toBe('/sala/mesas?zona=Terraza&activo=true');
    });
  });

  describe('Standardized Error Handling (ApiError)', () => {
    it('throws ApiError with statusCode 400 and structured details on bad request', async () => {
      server.use(
        http.post('*/test-bad-request', () => {
          return HttpResponse.json(
            {
              statusCode: 400,
              code: 'VALIDATION_ERROR',
              message: 'El número de mesa debe ser un entero positivo',
              details: { fieldErrors: { numeroMesa: ['Invalido'] } },
            },
            { status: 400 },
          );
        }),
      );

      try {
        await apiClient.post('http://localhost:3000/test-bad-request', { numeroMesa: -1 });
        expect.unreachable('Should have thrown ApiError');
      } catch (error) {
        expect(isApiError(error)).toBe(true);
        if (error instanceof ApiError) {
          expect(error.name).toBe('ApiError');
          expect(error.statusCode).toBe(400);
          expect(error.code).toBe('VALIDATION_ERROR');
          expect(error.message).toBe('El número de mesa debe ser un entero positivo');
          expect(error.details).toEqual({
            fieldErrors: { numeroMesa: ['Invalido'] },
          });
        }
      }
    });

    it('throws ApiError with statusCode 404 when resource is not found', async () => {
      server.use(
        http.get('*/test-not-found', () => {
          return HttpResponse.json(
            {
              statusCode: 404,
              code: 'MESA_NO_ENCONTRADA',
              message: 'La mesa solicitada no existe',
            },
            { status: 404 },
          );
        }),
      );

      await expect(apiClient.get('http://localhost:3000/test-not-found')).rejects.toThrow(ApiError);

      try {
        await apiClient.get('http://localhost:3000/test-not-found');
      } catch (error) {
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(404);
          expect(error.code).toBe('MESA_NO_ENCONTRADA');
        }
      }
    });

    it('throws ApiError with statusCode 409 and conflict code (MESA_NO_DISPONIBLE)', async () => {
      server.use(
        http.post('*/test-conflict', () => {
          return HttpResponse.json(
            {
              statusCode: 409,
              code: 'MESA_NO_DISPONIBLE',
              message: 'La mesa se encuentra ocupada o en limpieza',
              details: { mesaId: 'm-1' },
            },
            { status: 409 },
          );
        }),
      );

      try {
        await apiClient.post('http://localhost:3000/test-conflict', {});
        expect.unreachable('Should have thrown ApiError');
      } catch (error) {
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(409);
          expect(error.code).toBe('MESA_NO_DISPONIBLE');
          expect(error.message).toBe('La mesa se encuentra ocupada o en limpieza');
          expect(error.details).toEqual({ mesaId: 'm-1' });
        }
      }
    });

    it('handles non-JSON error responses gracefully with fallback ApiError', async () => {
      server.use(
        http.get('*/test-raw-500', () => {
          return new HttpResponse('Internal Server Error Plain Text', {
            status: 500,
            statusText: 'Internal Server Error',
          });
        }),
      );

      try {
        await apiClient.get('http://localhost:3000/test-raw-500');
        expect.unreachable('Should have thrown ApiError');
      } catch (error) {
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(500);
          expect(error.code).toBe('HTTP_500');
          expect(error.message).toContain('Internal Server Error');
        }
      }
    });
  });

  describe('Domain REST Services Integration with MSW Handlers', () => {
    describe('Mesas Service', () => {
      it('getMesas fetches all active tables', async () => {
        const mesas = await getMesas();
        expect(Array.isArray(mesas)).toBe(true);
        expect(mesas.length).toBeGreaterThan(0);
        expect(mesas[0]).toHaveProperty('numeroMesa');
      });

      it('getMesasEnVivo fetches live board status with tieneReservaProxima', async () => {
        const enVivo = await getMesasEnVivo();
        expect(Array.isArray(enVivo)).toBe(true);
        expect(enVivo[0]).toHaveProperty('tieneReservaProxima');
      });

      it('getMesa fetches a single table by ID', async () => {
        const mesa = await getMesa(FIXTURE_MESA_IDS.MESA_1);
        expect(mesa.mesaId).toBe(FIXTURE_MESA_IDS.MESA_1);
      });

      it('crearMesa creates a new table', async () => {
        const nueva = await crearMesa({
          numeroMesa: 99,
          capacidad: 4,
          zona: 'Principal',
        });
        expect(nueva.numeroMesa).toBe(99);
      });

      it('cambiarEstadoMesa updates table physical state from Ocupada to Limpieza pendiente', async () => {
        const res = await cambiarEstadoMesa(FIXTURE_MESA_IDS.MESA_3, {
          estado: EstadoMesa.LIMPIEZA_PENDIENTE,
        });
        expect(res.estado).toBe(EstadoMesa.LIMPIEZA_PENDIENTE);
      });

      it('ocuparMesa initiates dining session successfully', async () => {
        const res = await ocuparMesa(FIXTURE_MESA_IDS.MESA_1, {
          comensales: 2,
          meseroId: FIXTURE_MESERO_IDS.CARLOS,
        });
        expect(res.estado).toBe(EstadoMesa.OCUPADA);
        expect(res.sessionId).toBeDefined();
      });
    });

    describe('Reservas Service', () => {
      it('getReservas lists scheduled bookings', async () => {
        const reservas = await getReservas();
        expect(Array.isArray(reservas)).toBe(true);
        expect(reservas.length).toBeGreaterThan(0);
      });

      it('verificarDisponibilidad returns available tables for slot', async () => {
        const disponibles = await verificarDisponibilidad({
          fecha: '2026-10-15',
          horaInicio: '19:00',
          duracion: 90,
          personas: 2,
        });
        expect(Array.isArray(disponibles)).toBe(true);
      });

      it('crearReserva creates a confirmed booking', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-11T12:00:00-06:00'));
        const res = await crearReserva({
          mesaId: FIXTURE_MESA_IDS.MESA_7,
          fecha: '2026-10-11',
          horaInicio: '18:00',
          duracion: 60,
          cantidadPersonas: 2,
          cliente: {
            nombre: 'Juan Pérez',
            tel: '+529991234567',
          },
        });
        expect(res.reservaId).toBeDefined();
        expect(res.estado).toBe('Confirmada');
      });

      it('cancelarReserva cancels an existing reservation', async () => {
        const cancelada = await cancelarReserva(FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA);
        expect(cancelada.estado).toBe(EstadoReserva.CANCELADA);
      });

      it('noShowReserva marks expired booking as No-show', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-12T00:00:00-06:00'));
        const noShow = await noShowReserva(FIXTURE_RESERVA_IDS.RESERVA_2_FUTURA);
        expect(noShow.estado).toBe(EstadoReserva.NO_SHOW);
      });
    });

    describe('Uniones Service', () => {
      it('getUniones fetches active unions', async () => {
        const uniones = await getUniones();
        expect(Array.isArray(uniones)).toBe(true);
      });

      it('crearUnion aggregates tables and returns session', async () => {
        const union = await crearUnion({
          mesasIds: [FIXTURE_MESA_IDS.MESA_1, FIXTURE_MESA_IDS.MESA_2],
          totalPersonas: 4,
          meseroId: FIXTURE_MESERO_IDS.CARLOS,
          forzarOcupacion: true,
        });
        expect(union.unionId).toBeDefined();
        expect(union.estado).toBe(EstadoMesa.OCUPADA);
      });

      it('liberarUnion dissolves union and transitions tables to cleaning', async () => {
        const liberada = await liberarUnion(FIXTURE_UNION_IDS.UNION_1);
        expect(liberada.estado).toBe(EstadoMesa.LIMPIEZA_PENDIENTE);
      });
    });

    describe('Espera Service', () => {
      it('getListaEspera lists queue entries', async () => {
        const lista = await getListaEspera();
        expect(Array.isArray(lista)).toBe(true);
        expect(lista.length).toBeGreaterThan(0);
      });

      it('registrarEspera registers customer into queue', async () => {
        const entrada = await registrarEspera({
          nombreCliente: 'Familia Ramírez',
          telefonoContacto: '+529997654321',
          cantidadPersonas: 4,
        });
        expect(entrada.esperaId).toBeDefined();
        expect(entrada.estado).toBe(EstadoEspera.EN_ESPERA);
      });

      it('cambiarEstadoEspera updates waitlist status', async () => {
        const lista = await getListaEspera();
        const first = lista[0];
        const res = await cambiarEstadoEspera(first.esperaId, {
          estado: EstadoEspera.CANCELADO,
        });
        expect(res.estado).toBe(EstadoEspera.CANCELADO);
      });
    });
  });

  describe('QueryClient Retry Configuration', () => {
    it('does not retry 4xx ApiError business client errors', () => {
      const defaultOptions = queryClient.getDefaultOptions();
      const retryFn = defaultOptions.queries?.retry as (count: number, error: unknown) => boolean;
      expect(typeof retryFn).toBe('function');

      const error400 = new ApiError(400, 'BAD_REQUEST', 'Validation failed');
      const error404 = new ApiError(404, 'NOT_FOUND', 'Not found');
      const error409 = new ApiError(409, 'CONFLICT', 'Conflict');

      expect(retryFn(0, error400)).toBe(false);
      expect(retryFn(0, error404)).toBe(false);
      expect(retryFn(0, error409)).toBe(false);
    });

    it('retries server errors (500) up to 2 times', () => {
      const defaultOptions = queryClient.getDefaultOptions();
      const retryFn = defaultOptions.queries?.retry as (count: number, error: unknown) => boolean;

      const error500 = new ApiError(500, 'INTERNAL_SERVER_ERROR', 'Server error');

      expect(retryFn(0, error500)).toBe(true);
      expect(retryFn(1, error500)).toBe(true);
      expect(retryFn(2, error500)).toBe(false);
    });
  });
});
