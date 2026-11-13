import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermisoSala } from '@floor/shared';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROL,
  type AuthenticatedUser,
} from '../auth/auth.decorators';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import { PermissionsGuard } from './permissions.guard';

function crearContextoPermisos(opciones: {
  user?: AuthenticatedUser;
  headers?: Record<string, unknown>;
  esPublico?: boolean;
  permisosRequeridos?: string[];
}): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: jest.fn((clave: string) => {
      if (clave === IS_PUBLIC_KEY) {
        return opciones.esPublico ?? false;
      }
      if (clave === PERMISSIONS_KEY) {
        return opciones.permisosRequeridos;
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

describe('PermissionsGuard (PBAC estricto para Kong + Auth-Backend)', () => {
  it('permite el acceso cuando el endpoint está marcado como @Public()', () => {
    const { context, reflector } = crearContextoPermisos({
      esPublico: true,
      permisosRequeridos: [PermisoSala.TABLES_CREATE],
    });
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza con 403 NO_AUTORIZADO (deny-by-default) si el endpoint no es público ni declara @RequirePermissions', () => {
    const sinPermisos = crearContextoPermisos({
      permisosRequeridos: undefined,
      user: {
        userId: 'e1000000-0000-4000-8000-000000000001',
        roles: [ROL.ADMINISTRADOR],
        permissions: ['*'],
      },
    });
    const permisosVacios = crearContextoPermisos({
      permisosRequeridos: [],
      user: {
        userId: 'e1000000-0000-4000-8000-000000000001',
        roles: [ROL.ADMINISTRADOR],
        permissions: ['*'],
      },
    });

    expect(() =>
      new PermissionsGuard(sinPermisos.reflector).canActivate(sinPermisos.context),
    ).toThrow(DomainException);
    expect(() =>
      new PermissionsGuard(permisosVacios.reflector).canActivate(permisosVacios.context),
    ).toThrow(DomainException);
  });

  it('otorga bypass total cuando permissions incluye * o el rol es ADMINISTRADOR o ADMIN', () => {
    const casos: AuthenticatedUser[] = [
      {
        userId: 'e1000000-0000-4000-8000-000000000001',
        roles: [ROL.HOST],
        permissions: ['*'],
      },
      {
        userId: 'e1000000-0000-4000-8000-000000000002',
        roles: [ROL.ADMINISTRADOR],
        permissions: [],
      },
      {
        userId: 'e1000000-0000-4000-8000-000000000003',
        roles: [ROL.ADMIN],
        permissions: [],
      },
    ];

    for (const user of casos) {
      const { context, reflector } = crearContextoPermisos({
        permisosRequeridos: [PermisoSala.TABLES_DELETE],
        user,
      });
      expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
    }
  });

  it('autoriza cuando request.user posee todos los permisos requeridos en formato modulo:recurso:accion', () => {
    const { context, reflector } = crearContextoPermisos({
      permisosRequeridos: [PermisoSala.TABLES_VIEW, PermisoSala.TABLES_OCCUPY],
      user: {
        userId: 'e1000000-0000-4000-8000-000000000003',
        roles: [ROL.HOST],
        permissions: [
          PermisoSala.TABLES_VIEW,
          PermisoSala.TABLES_OCCUPY,
          PermisoSala.WAITLIST_ENTRIES_VIEW,
        ],
      },
    });
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('hace fallback a las cabeceras x-user-roles y x-user-permissions cuando request.user no existe', () => {
    const { context, reflector } = crearContextoPermisos({
      permisosRequeridos: [PermisoSala.RESERVATIONS_CREATE],
      headers: {
        'x-user-roles': 'HOST',
        'x-user-permissions': 'sala:tables:view, sala:reservations:create',
      },
    });
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza con 403 NO_AUTORIZADO si un MESERO o rol sin permiso sala:* intenta acceder a un endpoint', () => {
    const { context, reflector } = crearContextoPermisos({
      permisosRequeridos: [PermisoSala.TABLES_VIEW],
      user: {
        userId: 'b1000000-0000-4000-8000-000000000001',
        roles: [ROL.MESERO],
        permissions: ['orders:orders:view', 'orders:orders:create'],
      },
    });
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(DomainException);
    try {
      guard.canActivate(context);
    } catch (error) {
      const domainError = error as DomainException;
      expect(domainError.getStatus()).toBe(403);
      expect(domainError.getResponse()).toEqual({
        statusCode: 403,
        code: CODIGO_ERROR.NO_AUTORIZADO,
        message: 'No cuentas con los permisos necesarios para realizar esta acción',
        details: { permisosRequeridos: [PermisoSala.TABLES_VIEW] },
      });
    }
  });

  it('rechaza con 403 si faltan permisos requeridos aunque tenga otros permisos del módulo', () => {
    const { context, reflector } = crearContextoPermisos({
      permisosRequeridos: [PermisoSala.TABLES_VIEW, PermisoSala.TABLES_UPDATE],
      user: {
        userId: 'b1000000-0000-4000-8000-000000000001',
        roles: [ROL.HOST],
        permissions: [PermisoSala.TABLES_VIEW],
      },
    });
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(DomainException);
  });
});
