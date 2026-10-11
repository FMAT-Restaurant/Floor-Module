import { actualizarEstadoMesaSchema, mesaParamSchema, ocuparMesaSchema } from '@floor/shared';
import { http, HttpResponse } from 'msw';
import { mockDb } from '../db';
import { mockSalaSimulation } from '../simulation';
import { handleMockError, validationErrorResponse } from './utils';

function validateMesaId(params: Record<string, string | readonly string[] | undefined>) {
  return mesaParamSchema.safeParse({ mesaId: params.mesaId });
}

export const cicloHandlers = [
  // POST /sala/mesas/:mesaId/ocupar
  http.post('*/sala/mesas/:mesaId/ocupar', async ({ params, request }) => {
    try {
      const paramValidation = validateMesaId(params);
      if (!paramValidation.success) {
        return validationErrorResponse('mesaId debe ser un UUID v4 válido', paramValidation.error);
      }

      const body = await request.json().catch(() => null);
      const parsedBody = ocuparMesaSchema.safeParse(body);
      if (!parsedBody.success) {
        return validationErrorResponse('Datos inválidos para ocupar mesa', parsedBody.error);
      }

      const mesaId = paramValidation.data.mesaId;
      const mesaPrevia = mockDb.getMesa(mesaId);
      const resultado = mockDb.ocuparMesa(mesaId, parsedBody.data);

      mockSalaSimulation.emitMesaEstadoActualizado({
        mesaId,
        estado: resultado.estado,
        unionId: mesaPrevia.unionId,
        timestamp: new Date().toISOString(),
      });

      return HttpResponse.json(resultado, { status: 200 });
    } catch (err) {
      return handleMockError(err, 'Error al ocupar mesa');
    }
  }),

  // PATCH /sala/mesas/:mesaId/estado
  http.patch('*/sala/mesas/:mesaId/estado', async ({ params, request }) => {
    try {
      const paramValidation = validateMesaId(params);
      if (!paramValidation.success) {
        return validationErrorResponse('mesaId debe ser un UUID v4 válido', paramValidation.error);
      }

      const body = await request.json().catch(() => null);
      const parsedBody = actualizarEstadoMesaSchema.safeParse(body);
      if (!parsedBody.success) {
        return validationErrorResponse(
          'Estado inválido. Solo se permite "Limpieza pendiente" o "Libre"',
          parsedBody.error,
        );
      }

      const mesaId = paramValidation.data.mesaId;
      const mesaPrevia = mockDb.getMesa(mesaId);
      const resultado = mockDb.actualizarEstadoMesa(mesaId, parsedBody.data.estado);

      mockSalaSimulation.emitMesaEstadoActualizado({
        mesaId,
        estado: resultado.estado,
        unionId: mesaPrevia.unionId,
        timestamp: new Date().toISOString(),
      });

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
      return handleMockError(err, 'Error al actualizar estado de mesa');
    }
  }),
];
