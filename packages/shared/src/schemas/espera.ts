import { z } from 'zod';
import { EstadoEspera } from '../enums/index.js';
import { nombreClienteSchema, positiveIntSchema, telefonoSchema, uuidSchema } from './common.js';

export const esperaParamSchema = z
  .object({
    esperaId: uuidSchema,
  })
  .strict();

export const crearEsperaSchema = z
  .object({
    nombreCliente: nombreClienteSchema,
    telefonoContacto: telefonoSchema,
    cantidadPersonas: positiveIntSchema,
  })
  .strict();

export const listarEsperaQuerySchema = z.object({
  estado: z.nativeEnum(EstadoEspera).optional(),
});

export const actualizarEstadoEsperaSchema = z
  .object({
    estado: z.enum([EstadoEspera.SENTADO, EstadoEspera.CANCELADO, EstadoEspera.EN_ESPERA], {
      message: "El estado sólo puede actualizarse a 'Sentado', 'Cancelado' o 'En espera'",
    }),
  })
  .strict();

export const esperaDtoSchema = z.object({
  esperaId: uuidSchema,
  nombreCliente: nombreClienteSchema,
  telefonoContacto: telefonoSchema,
  cantidadPersonas: positiveIntSchema,
  horaLlegada: z.string(),
  estado: z.nativeEnum(EstadoEspera),
  idMesaAsignada: uuidSchema.nullable(),
});

export type EsperaParamDto = z.infer<typeof esperaParamSchema>;
export type CrearEsperaRequestDto = z.infer<typeof crearEsperaSchema>;
export type ListarEsperaQueryDto = z.infer<typeof listarEsperaQuerySchema>;
export type ActualizarEstadoEsperaRequestDto = z.infer<typeof actualizarEstadoEsperaSchema>;
export type EsperaDto = z.infer<typeof esperaDtoSchema>;
