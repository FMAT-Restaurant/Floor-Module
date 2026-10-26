import { createParamDecorator, ExecutionContext, HttpStatus } from '@nestjs/common';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';

/**
 * Extrae el identificador verificado del usuario (`userId` UUID v4) desde `request.user`,
 * el cual es poblado exclusivamente por `IdentityGuard` (BE-011) tras validar las cabeceras
 * perimetrales del API Gateway o la firma HMAC-SHA256 del JWT Bearer.
 */
export function extraerMeseroDeRequest(request: unknown): string | undefined {
  if (!request || typeof request !== 'object') {
    return undefined;
  }

  const req = request as {
    user?: unknown;
  };

  if (typeof req.user === 'string' && req.user.trim().length > 0) {
    return req.user.trim();
  }

  if (req.user && typeof req.user === 'object') {
    const userObj = req.user as Record<string, unknown>;
    for (const clave of ['userId', 'id', 'sub', 'meseroId']) {
      const valor = userObj[clave];
      if (typeof valor === 'string' && valor.trim().length > 0) {
        return valor.trim();
      }
    }
  }

  return undefined;
}

/**
 * Normaliza el `meseroId` resuelto desde el cuerpo validado o desde el usuario autenticado
 * en `request.user` (inyectado por `IdentityGuard`).
 * Rechaza con 401 NO_AUTENTICADO si no existe identidad verificada ni `meseroId` explícito.
 */
export function resolverMeseroId(usuarioActual: unknown, meseroIdCuerpo?: string): string {
  if (typeof meseroIdCuerpo === 'string' && meseroIdCuerpo.trim().length > 0) {
    return meseroIdCuerpo.trim();
  }

  if (typeof usuarioActual === 'string' && usuarioActual.trim().length > 0) {
    return usuarioActual.trim();
  }

  if (usuarioActual && typeof usuarioActual === 'object') {
    const obj = usuarioActual as Record<string, unknown>;
    for (const clave of ['userId', 'id', 'sub', 'meseroId']) {
      const valor = obj[clave];
      if (typeof valor === 'string' && valor.trim().length > 0) {
        return valor.trim();
      }
    }
  }

  throw new DomainException(
    HttpStatus.UNAUTHORIZED,
    CODIGO_ERROR.NO_AUTENTICADO,
    'No se encontró identidad verificada del usuario para ejecutar la operación',
  );
}

export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<unknown>();
    return extraerMeseroDeRequest(request);
  },
);

export const CurrentUser = UsuarioActual;
export const MeseroActual = UsuarioActual;
