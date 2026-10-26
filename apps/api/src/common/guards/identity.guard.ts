import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, type AuthenticatedUser } from '../auth/auth.decorators';
import {
  DEFAULT_JWT_SECRET,
  esUuidV4Valido,
  extraerRolesValidos,
  firmarJwtHs256,
  JWT_ISSUER,
  lanzarErrorPasswordTemporal,
  parsearListaSeparadaPorComas,
  verificarJwtHs256,
} from '../auth/jwt-hs256.util';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';

export { DEFAULT_JWT_SECRET, firmarJwtHs256, JWT_ISSUER, verificarJwtHs256 };

export const HEADER_USER_ID = 'x-user-id';
export const HEADER_STAFF_ID = 'x-staff-id';
export const HEADER_USER_ROLES = 'x-user-roles';
export const HEADER_USER_PERMISSIONS = 'x-user-permissions';
export const HEADER_PASSWORD_TEMPORARY = 'x-password-temporary';

export interface RequestConIdentidad extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
}

function leerCabecera(headers: Record<string, unknown>, nombre: string): string | undefined {
  const valor = headers[nombre] ?? headers[nombre.toLowerCase()];
  if (Array.isArray(valor)) {
    const primero = valor[0];
    return typeof primero === 'string' ? primero.trim() : undefined;
  }
  return typeof valor === 'string' ? valor.trim() : undefined;
}

/**
 * BE-011 · Guard de autenticación perimetral (Kong) con fallback local JWT HS256
 * (SPEC.md §1, ARCHITECTURE.md §8, ADR-007).
 * - Consume `X-User-Id`, `X-Staff-Id`, `X-User-Roles` y `X-User-Permissions` inyectadas por Kong.
 * - Si `X-Password-Temporary` es `'true'` o el JWT contiene `mustChangePassword === true`,
 *   rechaza con HTTP 403 `PASSWORD_CHANGE_REQUIRED`.
 * - Valida que `X-User-Id` / `sub` sea UUID v4 válido y que exista al menos un rol canónico válido.
 * - Si las cabeceras de Kong no están presentes, valida el token Bearer JWT con firma HS256
 *   y emisor estricto `urn:fmat:restaurant:auth`.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.esRutaPublica(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConIdentidad>();
    const headers = (request?.headers ?? {}) as Record<string, unknown>;

    const passwordTemporary = leerCabecera(headers, HEADER_PASSWORD_TEMPORARY);
    if (passwordTemporary?.trim().toLowerCase() === 'true') {
      lanzarErrorPasswordTemporal();
    }

    const identidadKong = this.extraerIdentidadDesdeKong(headers);
    if (identidadKong !== null) {
      request.user = identidadKong;
      return true;
    }

    const identidadJwt = this.extraerIdentidadDesdeJwt(headers);
    if (identidadJwt !== null) {
      request.user = identidadJwt;
      return true;
    }

    throw new DomainException(
      HttpStatus.UNAUTHORIZED,
      CODIGO_ERROR.NO_AUTENTICADO,
      'Credenciales de identidad faltantes o inválidas',
    );
  }

  private esRutaPublica(context: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return Boolean(esPublico);
  }

  private extraerIdentidadDesdeKong(headers: Record<string, unknown>): AuthenticatedUser | null {
    const rawUserId = leerCabecera(headers, HEADER_USER_ID);
    const rawRoles = leerCabecera(headers, HEADER_USER_ROLES);

    if (rawUserId === undefined && rawRoles === undefined) {
      return null;
    }

    if (!esUuidV4Valido(rawUserId)) {
      return null;
    }

    const roles = extraerRolesValidos(rawRoles);
    if (roles.length === 0) {
      return null;
    }

    const rawStaffId = leerCabecera(headers, HEADER_STAFF_ID);
    const rawPermissions = leerCabecera(headers, HEADER_USER_PERMISSIONS);

    return {
      userId: rawUserId.trim(),
      staffId: rawStaffId && rawStaffId.length > 0 ? rawStaffId : undefined,
      roles,
      permissions: parsearListaSeparadaPorComas(rawPermissions),
    };
  }

  private extraerIdentidadDesdeJwt(headers: Record<string, unknown>): AuthenticatedUser | null {
    const authHeader = leerCabecera(headers, 'authorization');
    if (!authHeader) {
      return null;
    }

    const coincidencia = /^Bearer\s+(\S+)$/i.exec(authHeader);
    if (!coincidencia) {
      return null;
    }

    const verificado = verificarJwtHs256(coincidencia[1], {
      lanzarEnPasswordTemporal: true,
    });
    if (!verificado || verificado.roles.length === 0) {
      return null;
    }

    return {
      userId: verificado.userId,
      staffId: verificado.staffId,
      roles: verificado.roles,
      permissions: verificado.permissions,
    };
  }
}
