import { crearUnionSchema, listarUnionesQuerySchema, unionParamSchema } from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { mockSalaSimulation } from '../simulation';
import { extractQueryParams, handleMockError, validationErrorResponse } from './utils';

export const unionesHandlers = [
  // POST /sala/mesas/uniones
  http.post('*/sala/mesas/uniones', async ({ request }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crearUnionSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse('Datos inválidos para crear unión', parsed.error);
      }

      const creada = mockDb.crearUnion(parsed.data);
      const now = new Date().toISOString();
      for (const mesaId of creada.mesasIds) {
        mockSalaSimulation.emitMesaEstadoActualizado({
          mesaId,
          estado: creada.estado,
          unionId: creada.unionId,
          timestamp: now,
        });
      }

      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      return handleMockError(err, 'Error al crear unión');
    }
  }),

  // POST /sala/mesas/uniones/:unionId/liberar
  http.post('*/sala/mesas/uniones/:unionId/liberar', ({ params }) => {
    try {
      const paramValidation = unionParamSchema.safeParse({ unionId: params.unionId });
      if (!paramValidation.success) {
        return validationErrorResponse('unionId debe ser un UUID v4 válido', paramValidation.error);
      }

      const liberada = mockDb.liberarUnion(paramValidation.data.unionId);
      const now = new Date().toISOString();
      for (const mesaId of liberada.mesasIds) {
        mockSalaSimulation.emitMesaEstadoActualizado({
          mesaId,
          estado: liberada.estado,
          unionId: null,
          timestamp: now,
        });
      }

      return HttpResponse.json(liberada, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al liberar unión');
    }
  }),

  // GET /sala/mesas/uniones
  http.get('*/sala/mesas/uniones', ({ request }) => {
    try {
      const queryParams = extractQueryParams(request.url);
      const parsedQuery = listarUnionesQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return validationErrorResponse(
          'Parámetros de consulta inválidos para uniones',
          parsedQuery.error,
        );
      }

      const uniones = mockDb.getUniones(parsedQuery.data);
      return HttpResponse.json(uniones, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al listar uniones');
    }
  }),
];
