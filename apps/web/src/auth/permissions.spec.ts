import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  getBaseUrl,
  getSessionToken,
  resolveGatewayBaseUrl,
  setBaseUrl,
  setFederatedToken,
} from '../api/client';
import { getSalaSocketUrl, resolveRemoteWsOrigin } from '../context/SalaSocketContext';
import {
  AUTH_SESSION_STORAGE_KEY,
  PermisoSala,
  decodeJwtUser,
  getStoredSession,
  hasAnyPermission,
  hasPermission,
  type ShellUser,
} from './permissions';

function encodeJwt(payload: Record<string, unknown>): string {
  const encodeSegment = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encodeSegment({ alg: 'HS256', typ: 'JWT' })}.${encodeSegment(payload)}.sig`;
}

describe('auth permissions helpers', () => {
  afterEach(() => {
    window.localStorage.clear();
    setFederatedToken(null);
    setBaseUrl(null);
    vi.unstubAllEnvs();
  });

  it('denies everything when user is null or undefined', () => {
    expect(hasPermission(null, PermisoSala.TABLES_VIEW)).toBe(false);
    expect(hasPermission(undefined, PermisoSala.TABLES_VIEW)).toBe(false);
    expect(hasAnyPermission(null, [PermisoSala.TABLES_VIEW, PermisoSala.RESERVATIONS_VIEW])).toBe(
      false,
    );
  });

  it('grants admin bypass for userType ADMIN, role ADMINISTRADOR/ADMIN, or wildcard *', () => {
    const byUserType: ShellUser = { id: 'u1', userType: 'ADMIN', permissions: [] };
    const byRoleAdministrador: ShellUser = {
      id: 'u2',
      roles: ['administrador'],
      permissions: [],
    };
    const byRoleAdmin: ShellUser = { id: 'u3', roles: ['ADMIN'], permissions: [] };
    const byWildcard: ShellUser = { id: 'u4', roles: ['HOST'], permissions: ['*'] };

    expect(hasPermission(byUserType, PermisoSala.TABLES_DELETE)).toBe(true);
    expect(hasPermission(byRoleAdministrador, PermisoSala.TABLES_CREATE)).toBe(true);
    expect(hasPermission(byRoleAdmin, PermisoSala.WAITLIST_ENTRIES_CREATE)).toBe(true);
    expect(hasPermission(byWildcard, PermisoSala.TABLE_UNIONS_RELEASE)).toBe(true);
  });

  it('evaluates exact PBAC permissions strictly for non-admin users', () => {
    const host: ShellUser = {
      id: 'u-host',
      roles: ['HOST'],
      userType: 'STAFF',
      permissions: [PermisoSala.TABLES_VIEW, PermisoSala.RESERVATIONS_VIEW],
    };

    expect(hasPermission(host, PermisoSala.TABLES_VIEW)).toBe(true);
    expect(hasPermission(host, PermisoSala.TABLES_CREATE)).toBe(false);
    expect(hasAnyPermission(host, [PermisoSala.TABLES_CREATE, PermisoSala.RESERVATIONS_VIEW])).toBe(
      true,
    );
    expect(hasAnyPermission(host, [PermisoSala.TABLES_CREATE, PermisoSala.TABLES_DELETE])).toBe(
      false,
    );
  });

  it('reads and parses fmat_restaurant_auth_session from localStorage safely', () => {
    expect(getStoredSession()).toBeNull();

    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, '{invalid json');
    expect(getStoredSession()).toBeNull();

    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'jwt-abc',
        user: {
          id: 'staff-1',
          staffId: 42,
          roles: ['HOST'],
          permissions: [PermisoSala.TABLES_VIEW],
        },
      }),
    );

    const session = getStoredSession();
    expect(session).toEqual({
      accessToken: 'jwt-abc',
      user: {
        id: 'staff-1',
        staffId: 42,
        roles: ['HOST'],
        permissions: [PermisoSala.TABLES_VIEW],
        username: undefined,
        fullName: undefined,
        userType: undefined,
      },
    });
  });

  it('decodes JWT claims into a ShellUser and rejects malformed tokens', () => {
    expect(decodeJwtUser(null)).toBeNull();
    expect(decodeJwtUser('not-a-jwt')).toBeNull();

    const jwt = encodeJwt({
      sub: 'user-99',
      staffId: 12,
      roles: ['HOST'],
      permissions: [PermisoSala.TABLES_VIEW, PermisoSala.TABLES_OCCUPY],
      userType: 'STAFF',
    });

    expect(decodeJwtUser(jwt)).toEqual({
      id: 'user-99',
      staffId: 12,
      username: undefined,
      fullName: undefined,
      roles: ['HOST'],
      permissions: [PermisoSala.TABLES_VIEW, PermisoSala.TABLES_OCCUPY],
      userType: 'STAFF',
    });
  });

  it('prefers federated token over localStorage shell session', () => {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: 'stored-token' }),
    );
    expect(getSessionToken()).toBe('stored-token');

    setFederatedToken('federated-token');
    expect(getSessionToken()).toBe('federated-token');

    setFederatedToken(null);
    expect(getSessionToken()).toBe('stored-token');
  });

  it('defaults REST base URL to Kong Gateway and WS URL to backend port 8085 in non-test mode', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_WS_URL', '');
    vi.stubEnv('VITE_USE_MOCKS', '');

    expect(getBaseUrl()).toBe('/sala');
    expect(getSalaSocketUrl()).toBe(`${window.location.origin}/sala`);

    vi.stubEnv('MODE', 'production');
    expect(getBaseUrl()).toBe('http://localhost:8000/api/v1/floor');
    expect(getSalaSocketUrl()).toBe('http://localhost:8085/sala');
    expect(resolveRemoteWsOrigin('http://192.168.1.50:5174/assets/remoteEntry.js')).toBe(
      'http://192.168.1.50:8085',
    );
    expect(resolveRemoteWsOrigin('file:///app/SalaSocketContext.ts')).toBe('http://localhost:8085');
    expect(resolveGatewayBaseUrl({ protocol: 'http:', hostname: '192.168.1.25' })).toBe(
      'http://192.168.1.25:8000/api/v1/floor',
    );
  });
});
