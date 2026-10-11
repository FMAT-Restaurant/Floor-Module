import {
  actualizarReservaSchema,
  consultarDisponibilidadQuerySchema,
  crearReservaSchema,
  listarReservasQuerySchema,
  reservaParamSchema,
  type ReservaDto,
} from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import {
  extractQueryParams,
  handleMockError,
  ROLES_GESTION_SALA,
  ROLES_LECTURA_GENERAL,
  validateAuthHeaders,
  validationErrorResponse,
} from './utils';

function validateReservaParam(params: Record<string, string | readonly string[] | undefined>) {
  return reservaParamSchema.safeParse({ reservaId: params.reservaId });
}

function handleReservaStatusChange(
  params: Record<string, string | readonly string[] | undefined>,
  action: (id: string) => ReservaDto,
  errorMsg: string,
) {
  try {
    const paramValidation = validateReservaParam(params);
    if (!paramValidation.success) {
      return validationErrorResponse('reservaId debe ser un UUID v4 válido', paramValidation.error);
    }
    const result = action(paramValidation.data.reservaId);
    return HttpResponse.json(result, { status: 200 });
  } catch (err) {
    return handleMockError(err, errorMsg);
  }
}

export const reservasHandlers = [
  // POST /sala/reservas
  http.post('*/sala/reservas', async ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_GESTION_SALA);
      if (!auth.ok) return auth.response;

      const body = await request.json().catch(() => null);
      const parsed = crearReservaSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse('Datos inválidos para crear reserva', parsed.error);
      }

      const creada = mockDb.crearReserva(parsed.data);
      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      return handleMockError(err, 'Error al crear reserva');
    }
  }),

  // GET /sala/reservas/disponibilidad
  http.get('*/sala/reservas/disponibilidad', ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

      const queryParams = extractQueryParams(request.url);
      const parsedQuery = consultarDisponibilidadQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return validationErrorResponse(
          'Parámetros requeridos inválidos para disponibilidad',
          parsedQuery.error,
        );
      }

      const disponibles = mockDb.getDisponibilidad(parsedQuery.data);
      return HttpResponse.json(disponibles, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al consultar disponibilidad');
    }
  }),

  // GET /sala/reservas
  http.get('*/sala/reservas', ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

      const queryParams = extractQueryParams(request.url);
      const parsedQuery = listarReservasQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return validationErrorResponse(
          'Parámetros de consulta inválidos para reservas',
          parsedQuery.error,
        );
      }

      const reservas = mockDb.getReservas(parsedQuery.data);
      return HttpResponse.json(reservas, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al listar reservas');
    }
  }),

  // PATCH /sala/reservas/:reservaId
  http.patch('*/sala/reservas/:reservaId', async ({ params, request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_GESTION_SALA);
      if (!auth.ok) return auth.response;

      const paramValidation = validateReservaParam(params);
      if (!paramValidation.success) {
        return validationErrorResponse(
          'reservaId debe ser un UUID v4 válido',
          paramValidation.error,
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = actualizarReservaSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse('Datos inválidos para actualizar reserva', parsed.error);
      }

      const actualizada = mockDb.actualizarReserva(paramValidation.data.reservaId, parsed.data);
      return HttpResponse.json(actualizada, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al actualizar reserva');
    }
  }),

  // POST /sala/reservas/:reservaId/cancelar
  http.post('*/sala/reservas/:reservaId/cancelar', ({ params, request }) => {
    const auth = validateAuthHeaders(request, ROLES_GESTION_SALA);
    if (!auth.ok) return auth.response;

    return handleReservaStatusChange(
      params,
      (id) => mockDb.cancelarReserva(id),
      'Error al cancelar reserva',
    );
  }),

  // POST /sala/reservas/:reservaId/no-show
  http.post('*/sala/reservas/:reservaId/no-show', ({ params, request }) => {
    const auth = validateAuthHeaders(request, ROLES_GESTION_SALA);
    if (!auth.ok) return auth.response;

    return handleReservaStatusChange(
      params,
      (id) => mockDb.noShowReserva(id),
      'Error al marcar reserva como No-show',
    );
  }),
];
