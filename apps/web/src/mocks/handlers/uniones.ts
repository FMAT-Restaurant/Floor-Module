import { crearUnionSchema, listarUnionesQuerySchema, unionParamSchema } from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { MockApiError, mockDb } from '../db';
import { mockSalaSimulation } from '../simulation';

export const unionesHandlers = [
  // POST /sala/mesas/uniones
  http.post('*/sala/mesas/uniones', async ({ request }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crearUnionSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para crear unión',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const creada = mockDb.crearUnion(parsed.data);

      // Disparar evento para cada mesa de la unión
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
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al crear unión' },
        { status: 500 },
      );
    }
  }),

  // POST /sala/mesas/uniones/:unionId/liberar
  http.post('*/sala/mesas/uniones/:unionId/liberar', ({ params }) => {
    try {
      const paramValidation = unionParamSchema.safeParse({ unionId: params.unionId });
      if (!paramValidation.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'unionId debe ser un UUID v4 válido',
            details: paramValidation.error.flatten(),
          },
          { status: 400 },
        );
      }

      const liberada = mockDb.liberarUnion(paramValidation.data.unionId);

      // Disparar evento de desvinculación y limpieza para cada mesa
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
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al liberar unión' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/mesas/uniones
  http.get('*/sala/mesas/uniones', ({ request }) => {
    try {
      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsedQuery = listarUnionesQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos para uniones',
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        );
      }

      const uniones = mockDb.getUniones(parsedQuery.data);
      return HttpResponse.json(uniones, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al listar uniones' },
        { status: 500 },
      );
    }
  }),
];
