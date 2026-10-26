import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { gatewayAuthHeadersSchema, roleSchema } from '@floor/shared';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';

export const JWT_ISSUER = 'urn:fmat:restaurant:auth';
export const DEFAULT_JWT_SECRET = 'fmat-restaurant-auth-secret-key-2026';

export const PATRON_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
}

export interface JwtPayload {
  sub?: unknown;
  userId?: unknown;
  staffId?: unknown;
  roles?: unknown;
  role?: unknown;
  permissions?: unknown;
  iss?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  mustChangePassword?: unknown;
  [claim: string]: unknown;
}

export interface JwtVerificado {
  sub: string;
  userId: string;
  staffId?: string;
  roles: string[];
  permissions: string[];
  iss: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  mustChangePassword?: boolean;
  payload: JwtPayload;
}

export interface OpcionesVerificacionJwt {
  secret?: string;
  lanzarEnPasswordTemporal?: boolean;
}

export function esUuidV4Valido(valor: unknown): valor is string {
  if (typeof valor !== 'string') {
    return false;
  }
  const limpio = valor.trim();
  return (
    gatewayAuthHeadersSchema.shape['x-user-id'].safeParse(limpio).success &&
    PATRON_UUID_V4.test(limpio)
  );
}

export function esRolCanonicoValido(rol: unknown): rol is string {
  if (typeof rol !== 'string') {
    return false;
  }
  return roleSchema.safeParse(rol.trim()).success;
}

export function parsearListaSeparadaPorComas(valor: string | undefined): string[] {
  if (!valor) {
    return [];
  }
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parsearListaClaim(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof valor === 'string') {
    return parsearListaSeparadaPorComas(valor);
  }
  return [];
}

export function extraerRolesValidos(valor: unknown): string[] {
  return parsearListaClaim(valor).filter((rol) => esRolCanonicoValido(rol));
}

export function normalizarBearerToken(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }
  const limpio = valor.trim();
  if (!limpio) {
    return null;
  }
  if (limpio.toLowerCase().startsWith('bearer ')) {
    const sinPrefijo = limpio.slice(7).trim();
    return sinPrefijo.length > 0 && !/\s/.test(sinPrefijo) ? sinPrefijo : null;
  }
  return !/\s/.test(limpio) ? limpio : null;
}

function decodificarJsonBase64Url<T>(segmento: string): T | null {
  try {
    const json = Buffer.from(segmento, 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function verificarFirmaHs256(
  headerSegmento: string,
  payloadSegmento: string,
  firmaSegmento: string,
  secreto: string,
): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(firmaSegmento)) {
    return false;
  }
  const firmaEsperada = createHmac('sha256', secreto)
    .update(`${headerSegmento}.${payloadSegmento}`)
    .digest();
  const firmaRecibida = Buffer.from(firmaSegmento, 'base64url');

  if (firmaRecibida.length !== firmaEsperada.length) {
    return false;
  }
  return timingSafeEqual(firmaRecibida, firmaEsperada);
}

function validarTiemposJwt(payload: JwtPayload, ahoraSegundos: number): boolean {
  if (payload.exp !== undefined) {
    if (typeof payload.exp !== 'number' || ahoraSegundos >= payload.exp) {
      return false;
    }
  }
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number' || ahoraSegundos < payload.nbf) {
      return false;
    }
  }
  return true;
}

export function lanzarErrorPasswordTemporal(): never {
  throw new DomainException(
    HttpStatus.FORBIDDEN,
    CODIGO_ERROR.PASSWORD_CHANGE_REQUIRED,
    'Se requiere cambio de contraseña provisional antes de operar en el módulo',
  );
}

/**
 * Valida un token JWT con algoritmo HS256 (SPEC.md §1, §6.2, ADR-007):
 * - Firma HMAC-SHA256 con `JWT_SECRET`
 * - `alg === 'HS256'`
 * - `iss === 'urn:fmat:restaurant:auth'`
 * - Vigencia (`exp`, `nbf`)
 * - `sub` (o `userId`) como UUID v4 válido
 * - Rechazo de `mustChangePassword === true`
 */
export function verificarJwtHs256(
  token: string | null | undefined,
  opciones: OpcionesVerificacionJwt = {},
): JwtVerificado | null {
  const tokenNormalizado = normalizarBearerToken(token);
  if (!tokenNormalizado) {
    return null;
  }

  const partes = tokenNormalizado.split('.');
  if (partes.length !== 3 || partes.some((p) => p.length === 0)) {
    return null;
  }

  const [headerB64, payloadB64, firmaB64] = partes;
  const header = decodificarJsonBase64Url<JwtHeader>(headerB64);
  if (!header || header.alg !== 'HS256') {
    return null;
  }

  const secreto = opciones.secret ?? (process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
  if (!verificarFirmaHs256(headerB64, payloadB64, firmaB64, secreto)) {
    return null;
  }

  const payload = decodificarJsonBase64Url<JwtPayload>(payloadB64);
  if (!payload || payload.iss !== JWT_ISSUER) {
    return null;
  }

  const ahoraSegundos = Math.floor(Date.now() / 1000);
  if (!validarTiemposJwt(payload, ahoraSegundos)) {
    return null;
  }

  const rawSub =
    typeof payload.sub === 'string' && payload.sub.trim().length > 0
      ? payload.sub.trim()
      : typeof payload.userId === 'string' && payload.userId.trim().length > 0
        ? payload.userId.trim()
        : '';

  if (!esUuidV4Valido(rawSub)) {
    return null;
  }

  if (payload.mustChangePassword === true) {
    if (opciones.lanzarEnPasswordTemporal) {
      lanzarErrorPasswordTemporal();
    }
    return null;
  }

  const roles = extraerRolesValidos(payload.roles ?? payload.role);
  const permissions = parsearListaClaim(payload.permissions);
  const staffId =
    typeof payload.staffId === 'string' && payload.staffId.trim().length > 0
      ? payload.staffId.trim()
      : undefined;

  return {
    sub: rawSub,
    userId: rawSub,
    staffId,
    roles,
    permissions,
    iss: JWT_ISSUER,
    iat: typeof payload.iat === 'number' ? payload.iat : undefined,
    exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    nbf: typeof payload.nbf === 'number' ? payload.nbf : undefined,
    mustChangePassword: false,
    payload,
  };
}

/**
 * Firma un token JWT con algoritmo HS256 (útil para desarrollo local y pruebas).
 */
export function firmarJwtHs256(
  payload: Record<string, unknown>,
  secret: string = process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const headerB64 = Buffer.from(JSON.stringify(header), 'utf-8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const firmaB64 = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${firmaB64}`;
}
