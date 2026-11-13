import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../auth/auth.decorators';
import { parsearListaSeparadaPorComas } from '../auth/jwt-hs256.util';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import {
  HEADER_USER_PERMISSIONS,
  HEADER_USER_ROLES,
  type RequestConIdentidad,
} from './identity.guard';

function leerListaCabecera(headers: Record<string, unknown>, nombre: string): string[] {
  const raw = headers[nombre] ?? headers[nombre.toLowerCase()];
  const valor = Array.isArray(raw) ? raw[0] : raw;
  return typeof valor === 'string' ? parsearListaSeparadaPorComas(valor) : [];
}

function extraerIdentidadAutorizacion(request: RequestConIdentidad | undefined): {
  roles: string[];
  permissions: string[];
} {
  const headers = (request?.headers ?? {}) as Record<string, unknown>;
  const rolesHeader = leerListaCabecera(headers, HEADER_USER_ROLES);
  const permissionsHeader = leerListaCabecera(headers, HEADER_USER_PERMISSIONS);

  const roles =
    Array.isArray(request?.user?.roles) && request.user.roles.length > 0
      ? request.user.roles
      : rolesHeader;
  const permissions =
    Array.isArray(request?.user?.permissions) && request.user.permissions.length > 0
      ? request.user.permissions
      : permissionsHeader;

  return { roles, permissions };
}

/**
 * Guard de autorización PBAC estricta para integración con Kong y Auth-Backend:
 * - Respeta `@Public()`.
 * - Aplica deny-by-default si el endpoint no declara `@RequirePermissions(...)`.
 * - Otorga bypass total si `permissions.includes('*')` o el rol es `ADMINISTRADOR` / `ADMIN`.
 * - Verifica que `permissions` contenga todos los permisos requeridos en formato `modulo:recurso:accion`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) {
      return true;
    }

    const permisosRequeridos = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permisosRequeridos || permisosRequeridos.length === 0) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        CODIGO_ERROR.NO_AUTORIZADO,
        'No cuentas con los permisos necesarios para realizar esta acción',
        { permisosRequeridos: [] },
      );
    }

    const request = context.switchToHttp().getRequest<RequestConIdentidad>();
    const { roles, permissions } = extraerIdentidadAutorizacion(request);

    if (permissions.includes('*') || roles.includes('ADMINISTRADOR') || roles.includes('ADMIN')) {
      return true;
    }

    const tienePermisos = permisosRequeridos.every((permiso) => permissions.includes(permiso));
    if (!tienePermisos) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        CODIGO_ERROR.NO_AUTORIZADO,
        'No cuentas con los permisos necesarios para realizar esta acción',
        { permisosRequeridos },
      );
    }

    return true;
  }
}
