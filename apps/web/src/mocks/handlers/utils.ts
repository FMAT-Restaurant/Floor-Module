import { HttpResponse } from 'msw';
import { gatewayAuthHeadersSchema, RoleEnum } from '@floor/shared';
import { mockDb, MockApiError } from '../db';

export const ROLES_ADMIN_ONLY = [RoleEnum.ADMINISTRADOR];
export const ROLES_GESTION_SALA = [RoleEnum.ADMINISTRADOR, RoleEnum.HOST, 'ROL_CAPITAN'];
export const ROLES_OPERACION_MESA = [
  RoleEnum.ADMINISTRADOR,
  RoleEnum.HOST,
  RoleEnum.MESERO,
  'ROL_CAPITAN',
];
export const ROLES_LECTURA_GENERAL = [
  RoleEnum.ADMINISTRADOR,
  RoleEnum.HOST,
  RoleEnum.MESERO,
  'ROL_CAPITAN',
];

export interface ValidatedAuthContext {
  userId: string;
  staffId: string;
  roles: string[];
}

export function extractQueryParams(urlStr: string): Record<string, string> {
  const url = new URL(urlStr);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });
  return queryParams;
}

export function validationErrorResponse(message: string, error: { flatten: () => unknown }) {
  return HttpResponse.json(
    {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten(),
    },
    { status: 400 },
  );
}

export function handleMockError(err: unknown, defaultMessage: string) {
  if (err instanceof MockApiError) {
    return HttpResponse.json(err.toResponse(), { status: err.statusCode });
  }
  return HttpResponse.json(
    {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: defaultMessage,
    },
    { status: 500 },
  );
}

function parseExplicitGatewayHeaders(request: Request) {
  const headerUserId = request.headers.get('x-user-id');
  const headerStaffId = request.headers.get('x-staff-id');
  const headerUserRoles = request.headers.get('x-user-roles');
  const headerPasswordTemp = request.headers.get('x-password-temporary');

  const isExplicit =
    headerUserId !== null ||
    headerStaffId !== null ||
    headerUserRoles !== null ||
    headerPasswordTemp !== null;

  const payload: Record<string, string> = {};
  if (headerUserId !== null) payload['x-user-id'] = headerUserId;
  if (headerStaffId !== null) payload['x-staff-id'] = headerStaffId;
  if (headerUserRoles !== null) payload['x-user-roles'] = headerUserRoles;
  if (headerPasswordTemp !== null) payload['x-password-temporary'] = headerPasswordTemp;

  return {
    isExplicit,
    isTemporaryPassword: headerPasswordTemp === 'true',
    payload,
  };
}

function resolveUserIdentity(
  request: Request,
):
  | { ok: true; userId: string; staffId: string; userRolesRaw: string }
  | { ok: false; response: Response } {
  const explicit = parseExplicitGatewayHeaders(request);

  if (explicit.isExplicit) {
    if (explicit.isTemporaryPassword) {
      return {
        ok: false,
        response: HttpResponse.json(
          {
            statusCode: 403,
            code: 'PASSWORD_CHANGE_REQUIRED',
            message: 'Debe cambiar su contraseña provisional antes de operar en el sistema',
          },
          { status: 403 },
        ),
      };
    }

    const parsed = gatewayAuthHeadersSchema.safeParse(explicit.payload);
    if (!parsed.success) {
      return {
        ok: false,
        response: HttpResponse.json(
          {
            statusCode: 401,
            code: 'NO_AUTENTICADO',
            message: 'Credenciales inválidas o faltantes en cabeceras de Gateway',
            details: parsed.error.flatten(),
          },
          { status: 401 },
        ),
      };
    }

    return {
      ok: true,
      userId: parsed.data['x-user-id'],
      staffId: parsed.data['x-staff-id'],
      userRolesRaw: parsed.data['x-user-roles'],
    };
  }

  const currentMock = mockDb.getMockAuth();
  if (!currentMock) {
    return {
      ok: false,
      response: HttpResponse.json(
        {
          statusCode: 401,
          code: 'NO_AUTENTICADO',
          message: 'Credenciales inválidas o faltantes',
        },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    userId: currentMock.userId,
    staffId: currentMock.staffId,
    userRolesRaw: currentMock.roles,
  };
}

export function validateAuthHeaders(
  request: Request,
  allowedRoles?: string[],
): { ok: true; auth: ValidatedAuthContext } | { ok: false; response: Response } {
  const identity = resolveUserIdentity(request);
  if (!identity.ok) {
    return identity;
  }

  const roles = identity.userRolesRaw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (allowedRoles?.length && !roles.some((r) => allowedRoles.includes(r))) {
    return {
      ok: false,
      response: HttpResponse.json(
        {
          statusCode: 403,
          code: 'NO_AUTORIZADO',
          message: 'El rol no cuenta con permisos suficientes para la acción',
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    auth: { userId: identity.userId, staffId: identity.staffId, roles },
  };
}
