import { z } from 'zod';
import { EstadoMesa } from '../enums/index.js';
import { booleanQuerySchema, positiveIntSchema, uuidSchema, zonaSchema } from './common.js';

export const mesaParamSchema = z
  .object({
    mesaId: uuidSchema,
  })
  .strict();

export const crearMesaSchema = z
  .object({
    numeroMesa: positiveIntSchema,
    capacidad: positiveIntSchema,
    zona: zonaSchema,
  })
  .strict();

export const actualizarMesaSchema = z
  .object({
    numeroMesa: positiveIntSchema.optional(),
    capacidad: positiveIntSchema.optional(),
    zona: zonaSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.numeroMesa !== undefined || data.capacidad !== undefined || data.zona !== undefined,
    {
      message: 'Debe proporcionar al menos un campo para actualizar',
    },
  );

export const listarMesasQuerySchema = z.object({
  zona: z.string().trim().min(1).optional(),
  estado: z.nativeEnum(EstadoMesa).optional(),
  incluirInactivas: booleanQuerySchema.optional().default(false),
});

export const mesaDtoSchema = z.object({
  mesaId: uuidSchema,
  numeroMesa: positiveIntSchema,
  capacidad: positiveIntSchema,
  zona: zonaSchema,
  estadoFisico: z.nativeEnum(EstadoMesa),
  unionId: uuidSchema.nullable(),
  activo: z.boolean(),
});

export const mesaEnVivoDtoSchema = mesaDtoSchema.extend({
  tieneReservaProxima: z.boolean(),
  ocupadaDesde: z.string().nullable(),
  meseroId: uuidSchema.nullable(),
});

export type MesaParamDto = z.infer<typeof mesaParamSchema>;
export type CrearMesaRequestDto = z.infer<typeof crearMesaSchema>;
export type ActualizarMesaRequestDto = z.infer<typeof actualizarMesaSchema>;
export type ListarMesasQueryDto = z.infer<typeof listarMesasQuerySchema>;
export type MesaDto = z.infer<typeof mesaDtoSchema>;
export type MesaEnVivoDto = z.infer<typeof mesaEnVivoDtoSchema>;
