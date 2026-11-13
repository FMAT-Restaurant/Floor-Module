import { SetMetadata } from '@nestjs/common';
import { PermisoSala, RoleEnum } from '@floor/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

export { PermisoSala };

/**
 * Marca un controlador o endpoint como público, omitiendo IdentityGuard y PermissionsGuard
 * (por ejemplo, GET /health).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Declara los permisos PBAC (`modulo:recurso:accion`) requeridos para ejecutar
 * un controlador o endpoint según el catálogo oficial de Auth-Backend.
 */
export const RequirePermissions = (
  ...permissions: (PermisoSala | string)[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Roles canónicos del ecosistema FMAT-Restaurant (ARCHITECTURE.md §8).
 */
export const ROL = {
  ADMINISTRADOR: RoleEnum.ADMINISTRADOR,
  ADMIN: RoleEnum.ADMIN,
  HOST: RoleEnum.HOST,
  GESTOR_MENU: RoleEnum.GESTOR_MENU,
  ALMACENISTA: RoleEnum.ALMACENISTA,
  MESERO: RoleEnum.MESERO,
  CHEF_MASTER: RoleEnum.CHEF_MASTER,
  CAJERO: RoleEnum.CAJERO,
  CAPITAN: 'ROL_CAPITAN',
} as const;

export type RolCanonico = (typeof ROL)[keyof typeof ROL];

/** Identidad autenticada adjunta al request HTTP tras pasar por IdentityGuard. */
export interface AuthenticatedUser {
  userId: string;
  staffId?: string;
  roles: string[];
  permissions: string[];
}
