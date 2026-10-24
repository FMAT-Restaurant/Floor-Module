import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../auth/auth.decorators';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import { HEADER_USER_ROLES, type RequestConIdentidad } from './identity.guard';

function extraerRolesDeRequest(request: RequestConIdentidad | undefined): string[] {
  if (Array.isArray(request?.user?.roles)) {
    return request.user.roles;
  }

  const headers = (request?.headers ?? {}) as Record<string, unknown>;
  const rawRoles = headers[HEADER_USER_ROLES];
  const valor = Array.isArray(rawRoles) ? rawRoles[0] : rawRoles;
  if (typeof valor !== 'string') {
    return [];
  }
  return valor
    .split(',')
    .map((rol) => rol.trim())
    .filter((rol) => rol.length > 0);
}

/**
 * BE-011 · Guard de autorización basada en roles canónicos (SPEC.md §1.1, ARCHITECTURE.md §8).
 * Verifica que la identidad autenticada posea al menos uno de los roles requeridos por el endpoint;
 * en caso contrario, lanza HTTP 403 `NO_AUTORIZADO`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
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

    const rolesRequeridos = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConIdentidad>();
    const rolesUsuario = extraerRolesDeRequest(request);
    const tienePermiso = rolesRequeridos.some((rol) => rolesUsuario.includes(rol));

    if (!tienePermiso) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        CODIGO_ERROR.NO_AUTORIZADO,
        'El rol no cuenta con permisos suficientes para la acción',
        { rolesRequeridos },
      );
    }

    return true;
  }
}
