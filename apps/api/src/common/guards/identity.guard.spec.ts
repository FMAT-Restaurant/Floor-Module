import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';
import {
  DEFAULT_JWT_SECRET,
  firmarJwtHs256,
  IdentityGuard,
  JWT_ISSUER,
  type RequestConIdentidad,
} from './identity.guard';

const USER_ID = 'e1000000-0000-4000-8000-000000000001';

function crearContexto(headers: Record<string, unknown> = {}): {
  context: ExecutionContext;
  request: RequestConIdentidad;
} {
  const request = { headers } as unknown as RequestConIdentidad;
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class DummyController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('IdentityGuard (BE-011, SPEC §1, ARCHITECTURE §8, ADR-007)', () => {
  const secretOriginal = process.env.JWT_SECRET;

  afterEach(() => {
    if (secretOriginal === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = secretOriginal;
    }
    jest.restoreAllMocks();
  });

  describe('rutas públicas (@Public)', () => {
    it('permite el paso sin validar cabeceras ni token si el endpoint es público', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(true),
      } as unknown as Reflector;
      const guard = new IdentityGuard(reflector);
      const { context } = crearContexto({});

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('autenticación mediante cabeceras de Kong', () => {
    it('extrae X-User-Id, X-Staff-Id, X-User-Roles y X-User-Permissions e inyecta request.user', () => {
      const guard = new IdentityGuard();
      const { context, request } = crearContexto({
        'x-user-id': USER_ID,
        'x-staff-id': 'M000104',
        'x-user-roles': 'HOST, MESERO',
        'x-user-permissions': 'mesas:read, mesas:write',
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({
        userId: USER_ID,
        staffId: 'M000104',
        roles: ['HOST', 'MESERO'],
        permissions: ['mesas:read', 'mesas:write'],
      });
    });

    it('soporta cabeceras en arreglo y omite X-Staff-Id / X-User-Permissions cuando no se envían', () => {
      const guard = new IdentityGuard();
      const { context, request } = crearContexto({
        'x-user-id': [USER_ID],
        'x-user-roles': ['ADMINISTRADOR'],
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({
        userId: USER_ID,
        staffId: undefined,
        roles: ['ADMINISTRADOR'],
        permissions: [],
      });
    });

    it('ignora X-Password-Temporary (lo filtra Kong perimetralmente)', () => {
      const guard = new IdentityGuard();
      const { context, request } = crearContexto({
        'x-user-id': USER_ID,
        'x-user-roles': 'MESERO',
        'x-password-temporary': 'true',
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user?.userId).toBe(USER_ID);
    });

    it.each([
      ['falta X-User-Id', { 'x-user-roles': 'MESERO' }],
      ['X-User-Id vacío', { 'x-user-id': '   ', 'x-user-roles': 'MESERO' }],
      ['falta X-User-Roles', { 'x-user-id': USER_ID }],
      ['X-User-Roles sin roles válidos', { 'x-user-id': USER_ID, 'x-user-roles': ' , ' }],
    ])('rechaza con 401 NO_AUTENTICADO cuando %s y no hay JWT', (_caso, headers) => {
      const guard = new IdentityGuard();
      const { context } = crearContexto(headers);

      expect(() => guard.canActivate(context)).toThrow(DomainException);
      try {
        guard.canActivate(context);
      } catch (error) {
        const domainError = error as DomainException;
        expect(domainError.getStatus()).toBe(401);
        expect(domainError.getResponse()).toMatchObject({
          statusCode: 401,
          code: CODIGO_ERROR.NO_AUTENTICADO,
        });
      }
    });
  });

  describe('fallback local con token Bearer JWT (HS256)', () => {
    it('valida un JWT HS256 con iss urn:fmat:restaurant:auth y extrae claims en arreglo', () => {
      const guard = new IdentityGuard();
      const ahora = Math.floor(Date.now() / 1000);
      const token = firmarJwtHs256({
        sub: USER_ID,
        staffId: 'ADMIN',
        roles: ['ADMINISTRADOR', 'ROL_CAPITAN'],
        permissions: ['mesas:manage'],
        iss: JWT_ISSUER,
        nbf: ahora - 10,
        exp: ahora + 3600,
      });
      const { context, request } = crearContexto({
        authorization: `Bearer ${token}`,
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({
        userId: USER_ID,
        staffId: 'ADMIN',
        roles: ['ADMINISTRADOR', 'ROL_CAPITAN'],
        permissions: ['mesas:manage'],
      });
    });

    it('soporta claims userId, role y permissions como cadenas separadas por comas y JWT_SECRET personalizado', () => {
      process.env.JWT_SECRET = 'mi-secreto-personalizado-2026';
      const guard = new IdentityGuard();
      const token = firmarJwtHs256(
        {
          userId: USER_ID,
          role: 'HOST, MESERO',
          permissions: 'reservas:read, reservas:write',
          iss: JWT_ISSUER,
        },
        'mi-secreto-personalizado-2026',
      );
      const { context, request } = crearContexto({
        authorization: `Bearer ${token}`,
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toEqual({
        userId: USER_ID,
        staffId: undefined,
        roles: ['HOST', 'MESERO'],
        permissions: ['reservas:read', 'reservas:write'],
      });
    });

    it('rechaza con 401 si el claim iss no es estrictamente urn:fmat:restaurant:auth', () => {
      const guard = new IdentityGuard();
      const token = firmarJwtHs256({
        sub: USER_ID,
        roles: ['MESERO'],
        iss: 'urn:otro:emisor',
      });
      const { context } = crearContexto({ authorization: `Bearer ${token}` });

      expect(() => guard.canActivate(context)).toThrow(DomainException);
    });

    it('rechaza con 401 si la firma HS256 fue generada con otro secreto', () => {
      const guard = new IdentityGuard();
      const token = firmarJwtHs256(
        {
          sub: USER_ID,
          roles: ['MESERO'],
          iss: JWT_ISSUER,
        },
        'secreto-incorrecto',
      );
      const { context } = crearContexto({ authorization: `Bearer ${token}` });

      expect(() => guard.canActivate(context)).toThrow(DomainException);
    });

    it('rechaza con 401 si el algoritmo en el header no es HS256', () => {
      const guard = new IdentityGuard();
      const token = firmarJwtHs256(
        { sub: USER_ID, roles: ['MESERO'], iss: JWT_ISSUER },
        DEFAULT_JWT_SECRET,
        { alg: 'none', typ: 'JWT' },
      );
      const { context } = crearContexto({ authorization: `Bearer ${token}` });

      expect(() => guard.canActivate(context)).toThrow(DomainException);
    });

    it('rechaza con 401 si el token ha expirado (exp) o aún no es válido (nbf)', () => {
      const guard = new IdentityGuard();
      const ahora = Math.floor(Date.now() / 1000);
      const expirado = firmarJwtHs256({
        sub: USER_ID,
        roles: ['MESERO'],
        iss: JWT_ISSUER,
        exp: ahora - 60,
      });
      const futuro = firmarJwtHs256({
        sub: USER_ID,
        roles: ['MESERO'],
        iss: JWT_ISSUER,
        nbf: ahora + 60,
      });

      expect(() =>
        guard.canActivate(crearContexto({ authorization: `Bearer ${expirado}` }).context),
      ).toThrow(DomainException);
      expect(() =>
        guard.canActivate(crearContexto({ authorization: `Bearer ${futuro}` }).context),
      ).toThrow(DomainException);
    });

    it.each([
      ['sin cabecera Authorization ni Kong', {}],
      ['esquema distinto de Bearer', { authorization: 'Basic dXNlcjpwYXNz' }],
      ['token con menos de 3 partes', { authorization: 'Bearer a.b' }],
      ['header base64 corrupto', { authorization: 'Bearer !!!.eyJpc3MiOiJ1cm4ifQ.sig' }],
      [
        'firma con caracteres inválidos',
        {
          authorization: `Bearer ${firmarJwtHs256({ sub: USER_ID, iss: JWT_ISSUER })
            .split('.')
            .slice(0, 2)
            .join('.')}.firma$invalida`,
        },
      ],
      [
        'firma de longitud distinta',
        {
          authorization: `Bearer ${firmarJwtHs256({ sub: USER_ID, iss: JWT_ISSUER })
            .split('.')
            .slice(0, 2)
            .join('.')}.abc`,
        },
      ],
      [
        'payload sin sub ni userId',
        {
          authorization: `Bearer ${firmarJwtHs256({ roles: ['MESERO'], iss: JWT_ISSUER })}`,
        },
      ],
    ])('rechaza con 401 cuando el token es inválido (%s)', (_caso, headers) => {
      const guard = new IdentityGuard();
      const { context } = crearContexto(headers);

      expect(() => guard.canActivate(context)).toThrow(DomainException);
    });
  });
});
