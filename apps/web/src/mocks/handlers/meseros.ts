import { asignarMeseroSchema, listarAsignacionesQuerySchema, mesaParamSchema } from '@floor/shared';
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

export const meserosHandlers = [
  // GET /api/v1/staff (simulación de directorio de meseros en Auth)
  http.get('*/api/v1/staff', ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

      const queryParams = extractQueryParams(request.url);
      if (queryParams.role && queryParams.role !== 'MESERO') {
        return HttpResponse.json([], { status: 200 });
      }

      const isActive =
        queryParams.isActive === undefined ? undefined : queryParams.isActive === 'true';

      const meseros = mockDb.getMeseros(isActive);
      return HttpResponse.json(
        meseros.map((mesero) => {
          const [firstName, ...rest] = mesero.nombre.split(' ');
          return {
            id: mesero.meseroId,
            firstName,
            lastName: rest.join(' '),
            roles: ['MESERO'],
            isActive: mesero.activo,
          };
        }),
        { status: 200 },
      );
    } catch (err) {
      return handleMockError(err, 'Error al consultar meseros en Auth');
    }
  }),

  // PUT /sala/mesas/:mesaId/mesero
  http.put('*/sala/mesas/:mesaId/mesero', async ({ params, request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_GESTION_SALA);
      if (!auth.ok) return auth.response;

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
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

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
