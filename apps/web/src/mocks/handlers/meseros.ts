import { asignarMeseroSchema, listarAsignacionesQuerySchema, mesaParamSchema } from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { extractQueryParams, handleMockError, validationErrorResponse } from './utils';

export const meserosHandlers = [
  // PUT /sala/mesas/:mesaId/mesero
  http.put('*/sala/mesas/:mesaId/mesero', async ({ params, request }) => {
    try {
      const paramValidation = mesaParamSchema.safeParse({ mesaId: params.mesaId });
      if (!paramValidation.success) {
        return validationErrorResponse('mesaId debe ser un UUID v4 válido', paramValidation.error);
      }

      const body = await request.json().catch(() => null);
      const parsed = asignarMeseroSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse('Datos inválidos para asignación de mesero', parsed.error);
      }

      const asignacion = mockDb.asignarMesero(paramValidation.data.mesaId, parsed.data.meseroId);
      return HttpResponse.json(asignacion, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al asignar mesero');
    }
  }),

  // GET /sala/asignaciones
  http.get('*/sala/asignaciones', ({ request }) => {
    try {
      const queryParams = extractQueryParams(request.url);
      const parsedQuery = listarAsignacionesQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return validationErrorResponse(
          'Parámetros de consulta inválidos para asignaciones',
          parsedQuery.error,
        );
      }

      const asignaciones = mockDb.getAsignaciones(parsedQuery.data);
      return HttpResponse.json(asignaciones, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al consultar asignaciones');
    }
  }),
];
