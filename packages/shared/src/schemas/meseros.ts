import { z } from 'zod';
import { booleanQuerySchema, uuidSchema } from './common';

export const asignarMeseroSchema = z
  .object({
    meseroId: uuidSchema,
  })
  .strict();

export const listarAsignacionesQuerySchema = z.object({
  meseroId: uuidSchema.optional(),
  activo: booleanQuerySchema.optional().default(true),
});

export const asignacionDtoSchema = z.object({
  asignacionId: uuidSchema,
  mesaId: uuidSchema,
  meseroId: uuidSchema,
  fechaHoraInicio: z.string(),
  fechaHoraFin: z.string().nullable(),
  activo: z.boolean(),
});

export type AsignarMeseroRequestDto = z.infer<typeof asignarMeseroSchema>;
export type ListarAsignacionesQueryDto = z.infer<typeof listarAsignacionesQuerySchema>;
export type AsignacionDto = z.infer<typeof asignacionDtoSchema>;
