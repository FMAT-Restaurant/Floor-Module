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

export function validateAuthHeaders(
  request: Request,
  allowedRoles?: string[],
): { ok: true; auth: ValidatedAuthContext } | { ok: false; response: Response } {
  const headerUserId = request.headers.get('x-user-id');
  const headerStaffId = request.headers.get('x-staff-id');
  const headerUserRoles = request.headers.get('x-user-roles');
  const headerPasswordTemp = request.headers.get('x-password-temporary');

  const hasExplicitAuth =
    headerUserId !== null ||
    headerStaffId !== null ||
    headerUserRoles !== null ||
    headerPasswordTemp !== null;

  let userId: string;
  let staffId: string;
  let userRolesRaw: string;

  if (hasExplicitAuth) {
    if (headerPasswordTemp === 'true') {
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

    const headersPayload: Record<string, string> = {};
    if (headerUserId !== null) headersPayload['x-user-id'] = headerUserId;
    if (headerStaffId !== null) headersPayload['x-staff-id'] = headerStaffId;
    if (headerUserRoles !== null) headersPayload['x-user-roles'] = headerUserRoles;
    if (headerPasswordTemp !== null) headersPayload['x-password-temporary'] = headerPasswordTemp;

    const parsed = gatewayAuthHeadersSchema.safeParse(headersPayload);
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

    userId = parsed.data['x-user-id'];
    staffId = parsed.data['x-staff-id'];
    userRolesRaw = parsed.data['x-user-roles'];
  } else {
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
    userId = currentMock.userId;
    staffId = currentMock.staffId;
    userRolesRaw = currentMock.roles;
  }

  const roles = userRolesRaw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (allowedRoles && allowedRoles.length > 0) {
    const isAuthorized = roles.some((r) => allowedRoles.includes(r));
    if (!isAuthorized) {
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
  }

  return {
    ok: true,
    auth: { userId, staffId, roles },
  };
}
