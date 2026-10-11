import {
  actualizarEstadoEsperaSchema,
  crearEsperaSchema,
  esperaParamSchema,
  listarEsperaQuerySchema,
} from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { extractQueryParams, handleMockError, validationErrorResponse } from './utils';

export const esperaHandlers = [
  // POST /sala/espera
  http.post('*/sala/espera', async ({ request }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crearEsperaSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse(
          'Datos inválidos para registrar en lista de espera',
          parsed.error,
        );
      }

      const creada = mockDb.crearEspera(parsed.data);
      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      return handleMockError(err, 'Error al registrar en espera');
    }
  }),

  // GET /sala/espera
  http.get('*/sala/espera', ({ request }) => {
    try {
      const queryParams = extractQueryParams(request.url);
      const parsedQuery = listarEsperaQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return validationErrorResponse(
          'Parámetros de consulta inválidos para lista de espera',
          parsedQuery.error,
        );
      }

      const lista = mockDb.getEspera(parsedQuery.data);
      return HttpResponse.json(lista, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al consultar lista de espera');
    }
  }),

  // PATCH /sala/espera/:esperaId/estado
  http.patch('*/sala/espera/:esperaId/estado', async ({ params, request }) => {
    try {
      const paramValidation = esperaParamSchema.safeParse({ esperaId: params.esperaId });
      if (!paramValidation.success) {
        return validationErrorResponse(
          'esperaId debe ser un UUID v4 válido',
          paramValidation.error,
        );
      }

      const body = await request.json().catch(() => null);
      const parsed = actualizarEstadoEsperaSchema.safeParse(body);
      if (!parsed.success) {
        return validationErrorResponse(
          'Estado inválido. Solo se permite "Sentado", "Cancelado" o "En espera"',
          parsed.error,
        );
      }

      const actualizada = mockDb.actualizarEstadoEspera(
        paramValidation.data.esperaId,
        parsed.data.estado,
      );
      return HttpResponse.json(actualizada, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al actualizar espera');
    }
  }),
];
