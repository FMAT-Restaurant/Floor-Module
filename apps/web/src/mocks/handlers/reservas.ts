import {
  actualizarReservaSchema,
  consultarDisponibilidadQuerySchema,
  crearReservaSchema,
  listarReservasQuerySchema,
  reservaParamSchema,
} from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { MockApiError, mockDb } from '../db';

export const reservasHandlers = [
  // POST /sala/reservas
  http.post('*/sala/reservas', async ({ request }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crearReservaSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para crear reserva',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const creada = mockDb.crearReserva(parsed.data);
      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al crear reserva' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/reservas/disponibilidad (Must be before GET /sala/reservas)
  http.get('*/sala/reservas/disponibilidad', ({ request }) => {
    try {
      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsedQuery = consultarDisponibilidadQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parámetros requeridos inválidos para disponibilidad',
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        );
      }

      const disponibles = mockDb.getDisponibilidad(parsedQuery.data);
      return HttpResponse.json(disponibles, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al consultar disponibilidad' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/reservas
  http.get('*/sala/reservas', ({ request }) => {
    try {
      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsedQuery = listarReservasQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos para reservas',
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        );
      }

      const reservas = mockDb.getReservas(parsedQuery.data);
      return HttpResponse.json(reservas, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al listar reservas' },
        { status: 500 },
      );
    }
  }),

  // PATCH /sala/reservas/:reservaId
  http.patch('*/sala/reservas/:reservaId', async ({ params, request }) => {
    try {
      const paramValidation = reservaParamSchema.safeParse({ reservaId: params.reservaId });
      if (!paramValidation.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'reservaId debe ser un UUID v4 válido',
            details: paramValidation.error.flatten(),
          },
          { status: 400 },
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = actualizarReservaSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para actualizar reserva',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const actualizada = mockDb.actualizarReserva(paramValidation.data.reservaId, parsed.data);
      return HttpResponse.json(actualizada, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al actualizar reserva' },
        { status: 500 },
      );
    }
  }),

  // POST /sala/reservas/:reservaId/cancelar
  http.post('*/sala/reservas/:reservaId/cancelar', ({ params }) => {
    try {
      const paramValidation = reservaParamSchema.safeParse({ reservaId: params.reservaId });
      if (!paramValidation.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'reservaId debe ser un UUID v4 válido',
            details: paramValidation.error.flatten(),
          },
          { status: 400 },
        );
      }

      const cancelada = mockDb.cancelarReserva(paramValidation.data.reservaId);
      return HttpResponse.json(cancelada, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al cancelar reserva' },
        { status: 500 },
      );
    }
  }),

  // POST /sala/reservas/:reservaId/no-show
  http.post('*/sala/reservas/:reservaId/no-show', ({ params }) => {
    try {
      const paramValidation = reservaParamSchema.safeParse({ reservaId: params.reservaId });
      if (!paramValidation.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'reservaId debe ser un UUID v4 válido',
            details: paramValidation.error.flatten(),
          },
          { status: 400 },
        );
      }

      const noShow = mockDb.noShowReserva(paramValidation.data.reservaId);
      return HttpResponse.json(noShow, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        {
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: 'Error al marcar reserva como No-show',
        },
        { status: 500 },
      );
    }
  }),
];
