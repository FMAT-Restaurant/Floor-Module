import { actualizarEstadoMesaSchema, mesaParamSchema, ocuparMesaSchema } from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { MockApiError, mockDb } from '../db';
import { mockSalaSimulation } from '../simulation';

export const cicloHandlers = [
  // POST /sala/mesas/:mesaId/ocupar
  http.post('*/sala/mesas/:mesaId/ocupar', async ({ params, request }) => {
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
      const parsedBody = ocuparMesaSchema.safeParse(body);
      if (!parsedBody.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos para ocupar mesa',
            details: parsedBody.error.flatten(),
          },
          { status: 400 },
        );
      }

      const mesaId = paramValidation.data.mesaId;
      const mesaPrevia = mockDb.getMesa(mesaId);
      const resultado = mockDb.ocuparMesa(mesaId, parsedBody.data);

      // Disparar evento WebSocket simulado
      mockSalaSimulation.emitMesaEstadoActualizado({
        mesaId,
        estado: resultado.estado,
        unionId: mesaPrevia.unionId,
        timestamp: new Date().toISOString(),
      });

      return HttpResponse.json(resultado, { status: 200 });
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al ocupar mesa' },
        { status: 500 },
      );
    }
  }),

  // PATCH /sala/mesas/:mesaId/estado
  http.patch('*/sala/mesas/:mesaId/estado', async ({ params, request }) => {
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
      const parsedBody = actualizarEstadoMesaSchema.safeParse(body);
      if (!parsedBody.success) {
        return HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Estado inválido. Solo se permite "Limpieza pendiente" o "Libre"',
            details: parsedBody.error.flatten(),
          },
          { status: 400 },
        );
      }

      const mesaId = paramValidation.data.mesaId;
      const mesaPrevia = mockDb.getMesa(mesaId);
      const resultado = mockDb.actualizarEstadoMesa(mesaId, parsedBody.data.estado);

      // Disparar evento de mesa actualizada
      mockSalaSimulation.emitMesaEstadoActualizado({
        mesaId,
        estado: resultado.estado,
        unionId: mesaPrevia.unionId,
        timestamp: new Date().toISOString(),
      });

      // Si se liberó mesa y hubo match en lista de espera (RN-17)
      if (resultado.waitlistMatch) {
        mockSalaSimulation.emitEsperaMesaDisponible({
          mesaId,
          esperaId: resultado.waitlistMatch.esperaId,
          cliente: resultado.waitlistMatch.cliente,
        });
      }

      return HttpResponse.json(
        { mesaId: resultado.mesaId, estado: resultado.estado },
        { status: 200 },
      );
    } catch (err) {
      if (err instanceof MockApiError) {
        return HttpResponse.json(err.toResponse(), { status: err.statusCode });
      }
      return HttpResponse.json(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error al actualizar estado de mesa' },
        { status: 500 },
      );
    }
  }),
];
