import { z } from 'zod';

export const roleSchema = z
  .string()
  .regex(
    /^(ADMINISTRADOR|ADMIN|HOST|GESTOR_MENU|ALMACENISTA|MESERO|CHEF_MASTER|CAJERO|ROL_[A-Z0-9_]+)$/,
    'El rol debe ser un rol canónico o un rol dinámico con prefijo ROL_',
  );

export const permissionSchema = z
  .string()
  .regex(
    /^(\*|[a-z][a-z0-9_]*:[a-z][a-z0-9_]*:[a-z][a-z0-9_]*)$/,
    'El permiso debe ser * o tener el formato modulo:recurso:accion',
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
  'x-user-permissions': z.string().optional(),
  'x-password-temporary': z.enum(['true', 'false']).optional(),
});

export type RoleDto = z.infer<typeof roleSchema>;
export type PermissionDto = z.infer<typeof permissionSchema>;
export type GatewayAuthHeadersDto = z.infer<typeof gatewayAuthHeadersSchema>;
