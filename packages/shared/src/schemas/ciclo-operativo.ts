import { z } from 'zod';
import { EstadoMesa } from '../enums';
import { positiveIntSchema, uuidSchema } from './common';

export const ocuparMesaSchema = z
  .object({
    comensales: positiveIntSchema,
    meseroId: uuidSchema,
    reservaId: uuidSchema.optional(),
    esperaId: uuidSchema.optional(),
    forzarOcupacion: z.boolean().optional(),
    forzarSobrecupo: z.boolean().optional(),
  })
  .strict();

export const ocuparMesaResponseSchema = z.object({
  mesaId: uuidSchema,
  estado: z.literal(EstadoMesa.OCUPADA),
  sessionId: uuidSchema,
  advertencias: z.array(z.string()).optional(),
});

export const actualizarEstadoMesaSchema = z
  .object({
    estado: z.enum([EstadoMesa.LIMPIEZA_PENDIENTE, EstadoMesa.LIBRE], {
      message: "El estado sólo puede actualizarse a 'Limpieza pendiente' o 'Libre'",
    }),
  })
  .strict();

export const actualizarEstadoMesaResponseSchema = z.object({
  mesaId: uuidSchema,
  estado: z.nativeEnum(EstadoMesa),
});

export type OcuparMesaRequestDto = z.infer<typeof ocuparMesaSchema>;
export type OcuparMesaResponseDto = z.infer<typeof ocuparMesaResponseSchema>;
export type ActualizarEstadoMesaRequestDto = z.infer<typeof actualizarEstadoMesaSchema>;
export type ActualizarEstadoMesaResponseDto = z.infer<typeof actualizarEstadoMesaResponseSchema>;
