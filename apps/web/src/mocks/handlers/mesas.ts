import {
  actualizarMesaSchema,
  crearMesaSchema,
  listarMesasQuerySchema,
  mesaParamSchema,
} from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import {
  extractQueryParams,
  handleMockError,
  ROLES_ADMIN_ONLY,
  ROLES_LECTURA_GENERAL,
  validateAuthHeaders,
  validationErrorResponse,
} from './utils';

function validateMesaParam(params: Record<string, string | readonly string[] | undefined>) {
  return mesaParamSchema.safeParse({ mesaId: params.mesaId });
}

export const mesasHandlers = [
  // GET /sala/mesas
  http.get('*/sala/mesas', ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

      const queryParams = extractQueryParams(request.url);
      const parsedQuery = listarMesasQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return validationErrorResponse(
          'Parámetros de consulta inválidos para listar mesas',
          parsedQuery.error,
        );
      }

      const mesas = mockDb.getMesas(parsedQuery.data);
      return HttpResponse.json(mesas, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al consultar mesas');
    }
  }),

  // GET /sala/mesas/estado-en-vivo
  http.get('*/sala/mesas/estado-en-vivo', ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

      const mesasEnVivo = mockDb.getMesasEnVivo();
      return HttpResponse.json(mesasEnVivo, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al consultar estado en vivo');
    }
  }),

  // GET /sala/mesas/:mesaId
  http.get('*/sala/mesas/:mesaId', ({ params, request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_LECTURA_GENERAL);
      if (!auth.ok) return auth.response;

      const paramValidation = validateMesaParam(params);
      if (!paramValidation.success) {
        return validationErrorResponse('mesaId debe ser un UUID v4 válido', paramValidation.error);
      }

      const mesa = mockDb.getMesa(paramValidation.data.mesaId);
      return HttpResponse.json(mesa, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al obtener mesa');
    }
  }),

  // POST /sala/mesas
  http.post('*/sala/mesas', async ({ request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_ADMIN_ONLY);
      if (!auth.ok) return auth.response;

      const body = await request.json().catch(() => null);
      const parsed = crearMesaSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse('Datos inválidos para crear mesa', parsed.error);
      }

      const creada = mockDb.crearMesa(parsed.data);
      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      return handleMockError(err, 'Error al crear mesa');
    }
  }),

  // PATCH /sala/mesas/:mesaId
  http.patch('*/sala/mesas/:mesaId', async ({ params, request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_ADMIN_ONLY);
      if (!auth.ok) return auth.response;

      const paramValidation = validateMesaParam(params);
      if (!paramValidation.success) {
        return validationErrorResponse('mesaId debe ser un UUID v4 válido', paramValidation.error);
      }

      const body = await request.json().catch(() => null);
      const parsed = actualizarMesaSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse('Datos inválidos para actualizar mesa', parsed.error);
      }

      const actualizada = mockDb.actualizarMesa(paramValidation.data.mesaId, parsed.data);
      return HttpResponse.json(actualizada, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al actualizar mesa');
    }
  }),

  // DELETE /sala/mesas/:mesaId
  http.delete('*/sala/mesas/:mesaId', ({ params, request }) => {
    try {
      const auth = validateAuthHeaders(request, ROLES_ADMIN_ONLY);
      if (!auth.ok) return auth.response;

      const paramValidation = validateMesaParam(params);
      if (!paramValidation.success) {
        return validationErrorResponse('mesaId debe ser un UUID v4 válido', paramValidation.error);
      }

      mockDb.eliminarMesa(paramValidation.data.mesaId);
      return new HttpResponse(null, { status: 204 });
    } catch (err) {
      return handleMockError(err, 'Error al eliminar mesa');
    }
  }),
];
