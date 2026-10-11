import {
  actualizarEstadoEsperaSchema,
  crearEsperaSchema,
  esperaParamSchema,
  listarEsperaQuerySchema,
} from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { MockApiError, mockDb } from '../db';

export const esperaHandlers = [
  // POST /sala/espera
  http.post('*/sala/espera', async ({ request }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crearEsperaSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para registrar en lista de espera',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const creada = mockDb.crearEspera(parsed.data);
      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al registrar en espera' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/espera
  http.get('*/sala/espera', ({ request }) => {
    try {
      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsedQuery = listarEsperaQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos para lista de espera',
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        );
      }

      const lista = mockDb.getEspera(parsedQuery.data);
      return HttpResponse.json(lista, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al consultar lista de espera' },
        { status: 500 },
      );
    }
  }),

  // PATCH /sala/espera/:esperaId/estado
  http.patch('*/sala/espera/:esperaId/estado', async ({ params, request }) => {
    try {
      const paramValidation = esperaParamSchema.safeParse({ esperaId: params.esperaId });
      if (!paramValidation.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'esperaId debe ser un UUID v4 válido',
            details: paramValidation.error.flatten(),
          },
          { status: 400 },
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = actualizarEstadoEsperaSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Estado inválido. Solo se permite "Sentado", "Cancelado" o "En espera"',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const actualizada = mockDb.actualizarEstadoEspera(
        paramValidation.data.esperaId,
        parsed.data.estado,
      );
      return HttpResponse.json(actualizada, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al actualizar espera' },
        { status: 500 },
      );
    }
  }),
];
