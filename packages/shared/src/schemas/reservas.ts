import { z } from 'zod';
import { EstadoReserva } from '../enums/index.js';
import {
  duracionMinutosQuerySchema,
  duracionMinutosSchema,
  fechaSchema,
  horaSchema,
  nombreClienteSchema,
  positiveIntQuerySchema,
  positiveIntSchema,
  telefonoSchema,
  uuidSchema,
} from './common.js';

export const reservaParamSchema = z
  .object({
    reservaId: uuidSchema,
  })
  .strict();

export const clienteReservaSchema = z
  .object({
    nombre: nombreClienteSchema,
    tel: telefonoSchema,
  })
  .strict();

export const crearReservaSchema = z
  .object({
    mesaId: uuidSchema,
    fecha: fechaSchema,
    horaInicio: horaSchema,
    duracion: duracionMinutosSchema,
    cantidadPersonas: positiveIntSchema,
    cliente: clienteReservaSchema,
  })
  .strict();

export const crearReservaResponseSchema = z.object({
  reservaId: uuidSchema,
  mesaId: uuidSchema,
  estado: z.literal(EstadoReserva.CONFIRMADA),
});

export const actualizarReservaSchema = z
  .object({
    mesaId: uuidSchema.optional(),
    fecha: fechaSchema.optional(),
    horaInicio: horaSchema.optional(),
    duracion: duracionMinutosSchema.optional(),
    cantidadPersonas: positiveIntSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.mesaId !== undefined ||
      data.fecha !== undefined ||
      data.horaInicio !== undefined ||
      data.duracion !== undefined ||
      data.cantidadPersonas !== undefined,
    {
      message: 'Debe proporcionar al menos un campo para actualizar',
    },
  );

export const listarReservasQuerySchema = z.object({
  fecha: fechaSchema.optional(),
  mesaId: uuidSchema.optional(),
  estado: z.nativeEnum(EstadoReserva).optional(),
});

export const consultarDisponibilidadQuerySchema = z.object({
  fecha: fechaSchema,
  horaInicio: horaSchema,
  duracion: duracionMinutosQuerySchema,
  personas: positiveIntQuerySchema,
});

export const reservaDtoSchema = z.object({
  reservaId: uuidSchema,
  mesaId: uuidSchema,
  nombreContacto: nombreClienteSchema,
  telefonoContacto: telefonoSchema,
  cantidadPersonas: positiveIntSchema,
  fecha: fechaSchema,
  horaInicio: horaSchema,
  horaFin: horaSchema,
  estado: z.nativeEnum(EstadoReserva),
});

export type ReservaParamDto = z.infer<typeof reservaParamSchema>;
export type ClienteReservaDto = z.infer<typeof clienteReservaSchema>;
export type CrearReservaRequestDto = z.infer<typeof crearReservaSchema>;
export type CrearReservaResponseDto = z.infer<typeof crearReservaResponseSchema>;
export type ActualizarReservaRequestDto = z.infer<typeof actualizarReservaSchema>;
export type ListarReservasQueryDto = z.infer<typeof listarReservasQuerySchema>;
export type ConsultarDisponibilidadQueryDto = z.infer<typeof consultarDisponibilidadQuerySchema>;
export type ReservaDto = z.infer<typeof reservaDtoSchema>;
