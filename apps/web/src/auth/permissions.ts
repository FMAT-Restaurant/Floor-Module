import { PermisoSala } from '@floor/shared';
import { AUTH_SESSION_STORAGE_KEY, readRawShellSession } from '../api/client';

export { AUTH_SESSION_STORAGE_KEY, PermisoSala };

export interface ShellUser {
  id: string;
  staffId?: string | number | null;
  username?: string;
  fullName?: string;
  roles?: string[];
  permissions?: string[];
  userType?: 'ADMIN' | 'STAFF' | 'CUSTOMER' | string;
}

export interface StoredShellSession {
  accessToken: string;
  user?: ShellUser;
}

export interface FederatedModuleProps {
  token?: string | null;
  currentUser?: ShellUser | null;
  theme?: 'light' | 'dark';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeShellUser(raw: unknown): ShellUser | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id : '';
  const roles = normalizeStringArray(candidate.roles);
  const permissions = normalizeStringArray(candidate.permissions);
  const userType = typeof candidate.userType === 'string' ? candidate.userType : undefined;

  if (!id && roles.length === 0 && permissions.length === 0 && !userType) {
    return undefined;
  }

  return {
    id,
    staffId:
      typeof candidate.staffId === 'string' || typeof candidate.staffId === 'number'
        ? candidate.staffId
        : candidate.staffId === null
          ? null
          : undefined,
    username: typeof candidate.username === 'string' ? candidate.username : undefined,
    fullName: typeof candidate.fullName === 'string' ? candidate.fullName : undefined,
    roles,
    permissions,
    userType,
  };
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(
    Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''),
  );
}

export function decodeJwtUser(token: string | null | undefined): ShellUser | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    return (
      normalizeShellUser({
        id: typeof payload.sub === 'string' ? payload.sub : '',
        staffId: payload.staffId,
        username: payload.username,
        fullName: payload.fullName,
        roles: payload.roles,
        permissions: payload.permissions,
        userType: payload.userType,
      }) ?? null
    );
  } catch {
    return null;
  }
}

export function getStoredSession(): StoredShellSession | null {
  const parsed = readRawShellSession();
  if (!parsed) {
    return null;
  }
  const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken.trim() : '';
  const user = normalizeShellUser(parsed.user);
  if (!accessToken && !user) {
    return null;
  }
  return {
    accessToken,
    ...(user ? { user } : {}),
  };
}

export function isAdminUser(user: ShellUser | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (typeof user.userType === 'string' && user.userType.trim().toUpperCase() === 'ADMIN') {
    return true;
  }
  if (
    Array.isArray(user.roles) &&
    user.roles.some((role) => {
      const upper = typeof role === 'string' ? role.trim().toUpperCase() : '';
      return upper === 'ADMINISTRADOR' || upper === 'ADMIN';
    })
  ) {
    return true;
  }
  if (
    Array.isArray(user.permissions) &&
    user.permissions.some((perm) => typeof perm === 'string' && perm.trim() === '*')
  ) {
    return true;
  }
  return false;
}

export function hasPermission(
  user: ShellUser | null | undefined,
  permission: PermisoSala | string,
): boolean {
  if (!user) {
    return false;
  }
  if (isAdminUser(user)) {
    return true;
  }
  return (
    Array.isArray(user.permissions) &&
    user.permissions.some((perm) => typeof perm === 'string' && perm.trim() === permission)
  );
}

export function hasAnyPermission(
  user: ShellUser | null | undefined,
  permissions: readonly (PermisoSala | string)[],
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}
