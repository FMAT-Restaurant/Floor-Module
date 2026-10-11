import type { GatewayAuthHeadersDto } from '../schemas/auth';
import { RoleEnum } from '../enums';
import { FIXTURE_MESERO_IDS } from './meseros';

export interface AuthFixtureUser {
  userId: string;
  staffId: string;
  roles: string;
  nombre: string;
}

export const FIXTURE_AUTH_USERS: Record<string, AuthFixtureUser> = {
  ADMIN: {
    userId: 'e1000000-0000-4000-8000-000000000001',
    staffId: 'ADMIN',
    roles: RoleEnum.ADMINISTRADOR,
    nombre: 'Administrador General',
  },
  HOST: {
    userId: 'e1000000-0000-4000-8000-000000000002',
    staffId: 'H000001',
    roles: RoleEnum.HOST,
    nombre: 'Hostess Principal',
  },
  CAPITAN: {
    userId: 'e1000000-0000-4000-8000-000000000003',
    staffId: 'C000001',
    roles: 'ROL_CAPITAN',
    nombre: 'Capitán de Sala',
  },
  MESERO_CARLOS: {
    userId: FIXTURE_MESERO_IDS.CARLOS,
    staffId: 'M000101',
    roles: RoleEnum.MESERO,
    nombre: 'Carlos Gómez',
  },
  MESERO_ANA: {
    userId: FIXTURE_MESERO_IDS.ANA,
    staffId: 'M000102',
    roles: RoleEnum.MESERO,
    nombre: 'Ana Martínez',
  },
  MESERO_ROBERTO: {
    userId: FIXTURE_MESERO_IDS.ROBERTO,
    staffId: 'M000103',
    roles: RoleEnum.MESERO,
    nombre: 'Roberto Sánchez',
  },
};

export function createGatewayAuthHeaders(
  user: { userId: string; staffId: string; roles: string },
  options?: { passwordTemporary?: boolean },
): GatewayAuthHeadersDto {
  const headers: GatewayAuthHeadersDto = {
    'x-user-id': user.userId,
    'x-staff-id': user.staffId,
    'x-user-roles': user.roles,
  };
  if (options?.passwordTemporary !== undefined) {
    headers['x-password-temporary'] = options.passwordTemporary ? 'true' : 'false';
  }
  return headers;
}
