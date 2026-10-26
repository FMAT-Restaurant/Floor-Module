import { SetMetadata } from '@nestjs/common';
import { RoleEnum } from '@floor/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/**
 * Marca un controlador o endpoint como público, omitiendo IdentityGuard y RolesGuard
 * (por ejemplo, GET /health).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Declara los roles autorizados para ejecutar un controlador o endpoint según SPEC.md §1.1.
 */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Roles canónicos del ecosistema FMAT-Restaurant (SPEC.md §1.1, ARCHITECTURE.md §8).
 */
export const ROL = {
  ADMINISTRADOR: RoleEnum.ADMINISTRADOR,
  HOST: RoleEnum.HOST,
  MESERO: RoleEnum.MESERO,
  CAPITAN: 'ROL_CAPITAN',
} as const;

export type RolCanonico = (typeof ROL)[keyof typeof ROL];

/** Roles con acceso a lectura del plano y operación general de mesas (SPEC §1.1). */
export const ROLES_OPERACION_SALA: readonly string[] = [
  ROL.ADMINISTRADOR,
  ROL.HOST,
  ROL.MESERO,
  ROL.CAPITAN,
];

/** Roles con acceso a gestión de meseros, reservas, uniones y lista de espera (SPEC §1.1). */
export const ROLES_GESTION_SALA: readonly string[] = [ROL.ADMINISTRADOR, ROL.HOST, ROL.CAPITAN];

/** Identidad autenticada adjunta al request HTTP tras pasar por IdentityGuard. */
export interface AuthenticatedUser {
  userId: string;
  staffId?: string;
  roles: string[];
  permissions: string[];
}
