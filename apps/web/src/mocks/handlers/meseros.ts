import { asignarMeseroSchema, listarAsignacionesQuerySchema, mesaParamSchema } from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { MockApiError, mockDb } from '../db';

export const meserosHandlers = [
  // PUT /sala/mesas/:mesaId/mesero
  http.put('*/sala/mesas/:mesaId/mesero', async ({ params, request }) => {
    try {
      const paramValidation = mesaParamSchema.safeParse({ mesaId: params.mesaId });
      if (!paramValidation.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'mesaId debe ser un UUID v4 válido',
            details: paramValidation.error.flatten(),
          },
          { status: 400 },
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = asignarMeseroSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para asignación de mesero',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const asignacion = mockDb.asignarMesero(paramValidation.data.mesaId, parsed.data.meseroId);
      return HttpResponse.json(asignacion, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al asignar mesero' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/asignaciones
  http.get('*/sala/asignaciones', ({ request }) => {
    try {
      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsedQuery = listarAsignacionesQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos para asignaciones',
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        );
      }

      const asignaciones = mockDb.getAsignaciones(parsedQuery.data);
      return HttpResponse.json(asignaciones, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al consultar asignaciones' },
        { status: 500 },
      );
    }
  }),
];
