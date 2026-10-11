import {
  actualizarMesaSchema,
  crearMesaSchema,
  listarMesasQuerySchema,
  mesaParamSchema,
} from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { MockApiError, mockDb } from '../db';

export const mesasHandlers = [
  // GET /sala/mesas
  http.get('*/sala/mesas', ({ request }) => {
    try {
      const url = new URL(request.url);
      const queryParams: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const parsedQuery = listarMesasQuerySchema.safeParse(queryParams);
      if (!parsedQuery.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parámetros de consulta inválidos para listar mesas',
            details: parsedQuery.error.flatten(),
          },
          { status: 400 },
        );
      }

      const mesas = mockDb.getMesas(parsedQuery.data);
      return HttpResponse.json(mesas, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al consultar mesas' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/mesas/estado-en-vivo
  http.get('*/sala/mesas/estado-en-vivo', () => {
    try {
      const mesasEnVivo = mockDb.getMesasEnVivo();
      return HttpResponse.json(mesasEnVivo, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al consultar estado en vivo' },
        { status: 500 },
      );
    }
  }),

  // GET /sala/mesas/:mesaId
  http.get('*/sala/mesas/:mesaId', ({ params }) => {
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

      const mesa = mockDb.getMesa(paramValidation.data.mesaId);
      return HttpResponse.json(mesa, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al obtener mesa' },
        { status: 500 },
      );
    }
  }),

  // POST /sala/mesas
  http.post('*/sala/mesas', async ({ request }) => {
    try {
      const body = await request.json().catch(() => null);
      const parsed = crearMesaSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para crear mesa',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const creada = mockDb.crearMesa(parsed.data);
      return HttpResponse.json(creada, { status: 201 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al crear mesa' },
        { status: 500 },
      );
    }
  }),

  // PATCH /sala/mesas/:mesaId
  http.patch('*/sala/mesas/:mesaId', async ({ params, request }) => {
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
      const parsed = actualizarMesaSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para actualizar mesa',
            details: parsed.error.flatten(),
          },
          { status: 400 },
        );
      }

      const actualizada = mockDb.actualizarMesa(paramValidation.data.mesaId, parsed.data);
      return HttpResponse.json(actualizada, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al actualizar mesa' },
        { status: 500 },
      );
    }
  }),

  // DELETE /sala/mesas/:mesaId
  http.delete('*/sala/mesas/:mesaId', ({ params }) => {
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

      mockDb.eliminarMesa(paramValidation.data.mesaId);
      return new HttpResponse(null, { status: 204 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al eliminar mesa' },
        { status: 500 },
      );
    }
  }),
];
