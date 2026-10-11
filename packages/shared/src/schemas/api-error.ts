import { z } from 'zod';

export const apiErrorResponseSchema = z.object({
  statusCode: z.number().int({ message: 'El código de estado debe ser un número entero' }),
  code: z.string().min(1, { message: 'El código de error no puede estar vacío' }),
  message: z.string().min(1, { message: 'El mensaje de error no puede estar vacío' }),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiErrorResponseDto = z.infer<typeof apiErrorResponseSchema>;
