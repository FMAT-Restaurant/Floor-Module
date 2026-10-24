import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROL, ROLES_KEY, type AuthenticatedUser } from '../auth/auth.decorators';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import { RolesGuard } from './roles.guard';

function crearContextoRoles(opciones: {
  user?: AuthenticatedUser;
  headers?: Record<string, unknown>;
  esPublico?: boolean;
  rolesRequeridos?: string[];
}): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: jest.fn((clave: string) => {
      if (clave === IS_PUBLIC_KEY) {
        return opciones.esPublico ?? false;
      }
      if (clave === ROLES_KEY) {
        return opciones.rolesRequeridos;
      }
      return undefined;
    }),
  } as unknown as Reflector;

  const request = {
    user: opciones.user,
    headers: opciones.headers ?? {},
  };

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class DummyController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('RolesGuard (BE-011, SPEC §1.1, ARCHITECTURE §8)', () => {
  it('permite el acceso cuando el endpoint está marcado como @Public()', () => {
    const { context, reflector } = crearContextoRoles({
      esPublico: true,
      rolesRequeridos: [ROL.ADMINISTRADOR],
    });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el acceso cuando el endpoint no declara roles requeridos', () => {
    const { context, reflector } = crearContextoRoles({
      rolesRequeridos: undefined,
    });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('autoriza cuando request.user contiene al menos uno de los roles requeridos', () => {
    const { context, reflector } = crearContextoRoles({
      rolesRequeridos: [ROL.ADMINISTRADOR, ROL.HOST, ROL.CAPITAN],
      user: {
        userId: 'e1000000-0000-4000-8000-000000000003',
        roles: [ROL.CAPITAN],
        permissions: [],
      },
    });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('autoriza haciendo fallback a la cabecera x-user-roles si request.user no está presente', () => {
    const { context, reflector } = crearContextoRoles({
      rolesRequeridos: [ROL.ADMINISTRADOR],
      headers: { 'x-user-roles': ['HOST, ADMINISTRADOR'] },
    });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('lanza 403 NO_AUTORIZADO cuando el rol del usuario no tiene permisos para la acción', () => {
    const { context, reflector } = crearContextoRoles({
      rolesRequeridos: [ROL.ADMINISTRADOR],
      user: {
        userId: 'b1000000-0000-4000-8000-000000000001',
        roles: [ROL.MESERO],
        permissions: [],
      },
    });
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(DomainException);
    try {
      guard.canActivate(context);
    } catch (error) {
      const domainError = error as DomainException;
      expect(domainError.getStatus()).toBe(403);
      expect(domainError.getResponse()).toEqual({
        statusCode: 403,
        code: CODIGO_ERROR.NO_AUTORIZADO,
        message: 'El rol no cuenta con permisos suficientes para la acción',
        details: { rolesRequeridos: [ROL.ADMINISTRADOR] },
      });
    }
  });

  it('lanza 403 NO_AUTORIZADO si no hay roles en request.user ni en cabeceras', () => {
    const { context, reflector } = crearContextoRoles({
      rolesRequeridos: [ROL.HOST],
      headers: {},
    });
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(DomainException);
  });
});
