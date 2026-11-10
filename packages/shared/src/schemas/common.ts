import { z } from 'zod';

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_POSTGRES_INT4 = 2_147_483_647;

export const uuidSchema = z
  .string()
  .trim()
  .regex(UUID_V4_REGEX, { message: 'Debe ser un identificador UUID v4 válido' });

export const positiveIntSchema = z
  .number({ message: 'Debe ser un número' })
  .int({ message: 'Debe ser un número entero' })
  .min(1, { message: 'Debe ser mayor o igual a 1' })
  .max(MAX_POSTGRES_INT4, { message: `No debe exceder ${MAX_POSTGRES_INT4}` });

export const positiveIntQuerySchema = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }
  return val;
}, positiveIntSchema);

export const booleanQuerySchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return val;
}, z.boolean());

export const nonEmptyStringSchema = (min = 1, max = 100) =>
  z
    .string()
    .trim()
    .min(min, { message: `Debe tener al menos ${min} caracter(es)` })
    .max(max, { message: `No debe exceder ${max} caracteres` });

export const zonaSchema = z
  .string()
  .trim()
  .min(1, { message: 'La zona no puede estar vacía' })
  .max(50, { message: 'La zona no puede exceder 50 caracteres' });

export const telefonoSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9 +()-]{7,20}$/,
    'El teléfono debe tener entre 7 y 20 caracteres y contener solo dígitos y separadores válidos (+, -, (), espacios)',
  )
  .refine(
    (val) => (val.match(/\d/g) ?? []).length >= 7,
    'El teléfono debe contener al menos 7 dígitos numéricos',
  );

export function esFechaCalendarioValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anioStr, mesStr, diaStr] = valor.split('-');
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  if (anio < 1970 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    !Number.isNaN(fechaUtc.getTime()) &&
    fechaUtc.getUTCFullYear() === anio &&
    fechaUtc.getUTCMonth() === mes - 1 &&
    fechaUtc.getUTCDate() === dia
  );
}

export const fechaSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
  .refine(esFechaCalendarioValida, 'La fecha no es una fecha de calendario válida');

export const horaSchema = z
  .string()
  .trim()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener formato HH:mm (24 horas)');

export const duracionMinutosSchema = z
  .number({ message: 'La duración debe ser un número entero' })
  .int({ message: 'La duración debe ser un número entero' })
  .min(15, { message: 'La duración mínima es de 15 minutos' })
  .max(480, { message: 'La duración máxima es de 480 minutos' });

export const duracionMinutosQuerySchema = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }
  return val;
}, duracionMinutosSchema);

export const nombreClienteSchema = z
  .string()
  .trim()
  .min(1, { message: 'El nombre no puede estar vacío' })
  .max(100, { message: 'El nombre no puede exceder 100 caracteres' });

export const isoDateTimeSchema = z
  .string()
  .datetime({ message: 'Debe ser una fecha y hora ISO-8601 válida' });
