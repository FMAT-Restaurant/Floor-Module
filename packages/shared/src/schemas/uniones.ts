import { z } from 'zod';
import { EstadoMesa, EstadoUnion } from '../enums';
import { positiveIntSchema, uuidSchema, zonaSchema } from './common';

export const unionParamSchema = z
  .object({
    unionId: uuidSchema,
  })
  .strict();

export const crearUnionSchema = z
  .object({
    mesasIds: z
      .array(uuidSchema, {
        message: 'mesasIds debe ser un arreglo de UUIDs',
      })
      .min(2, { message: 'Se requieren al menos 2 mesas para crear una unión' })
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'mesasIds no debe contener identificadores duplicados',
      }),
    totalPersonas: positiveIntSchema,
    meseroId: uuidSchema,
    forzarOcupacion: z.boolean().optional(),
    forzarSobrecupo: z.boolean().optional(),
  })
  .strict();

export const crearUnionResponseSchema = z.object({
  unionId: uuidSchema,
  mesasIds: z.array(uuidSchema),
  estado: z.literal(EstadoMesa.OCUPADA),
  sessionId: uuidSchema,
});

export const liberarUnionResponseSchema = z.object({
  mesasIds: z.array(uuidSchema),
  estado: z.literal(EstadoMesa.LIMPIEZA_PENDIENTE),
});

export const listarUnionesQuerySchema = z.object({
  estado: z.nativeEnum(EstadoUnion).optional().default(EstadoUnion.ACTIVA),
});

export const unionDtoSchema = z.object({
  unionId: uuidSchema,
  zona: zonaSchema,
  mesasIds: z.array(uuidSchema),
  estado: z.nativeEnum(EstadoUnion),
  fechaCreacion: z.string(),
  fechaDisolucion: z.string().nullable(),
});

export type UnionParamDto = z.infer<typeof unionParamSchema>;
export type CrearUnionRequestDto = z.infer<typeof crearUnionSchema>;
export type CrearUnionResponseDto = z.infer<typeof crearUnionResponseSchema>;
export type LiberarUnionResponseDto = z.infer<typeof liberarUnionResponseSchema>;
export type ListarUnionesQueryDto = z.infer<typeof listarUnionesQuerySchema>;
export type UnionDto = z.infer<typeof unionDtoSchema>;
