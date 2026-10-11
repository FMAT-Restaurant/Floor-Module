import { z } from 'zod';

export const roleSchema = z
  .string()
  .regex(
    /^(ADMINISTRADOR|HOST|ALMACENISTA|MESERO|CHEF_MASTER|ROL_[A-Z0-9_]+)$/,
    'El rol debe ser un rol canónico o un rol dinámico con prefijo ROL_',
  );

export const gatewayAuthHeadersSchema = z.object({
  'x-user-id': z.string().uuid({ message: 'x-user-id debe ser un UUID v4 válido' }),
  'x-staff-id': z
    .string()
    .regex(
      /^([A-Z][0-9]{6}|ADMIN|ADM[0-9]{6})$/,
      'x-staff-id debe ser un código de nómina válido (ej. M000104, ADMIN o ADM000001)',
    ),
  'x-user-roles': z.string().min(1, { message: 'x-user-roles no puede estar vacío' }),
  'x-password-temporary': z.enum(['true', 'false']).optional(),
});

export type RoleDto = z.infer<typeof roleSchema>;
export type GatewayAuthHeadersDto = z.infer<typeof gatewayAuthHeadersSchema>;
