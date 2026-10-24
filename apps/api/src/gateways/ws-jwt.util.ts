import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'socket.io';

/**
 * Clave simétrica por defecto para desarrollo local y pruebas según ADR-007 y SPEC §6.2.
 */
export const DEFAULT_JWT_SECRET = 'fmat-restaurant-auth-secret-key-2026';

export interface WsJwtPayload {
  sub: string;
  staffId?: string;
  roles?: string[];
  iss?: string;
  iat?: number;
  exp?: number;
  [claim: string]: unknown;
}

interface JwtHeader {
  alg?: string;
  typ?: string;
}

function decodificarBase64UrlJson<T>(segmento: string): T | null {
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

function normalizarBearerToken(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }
  const limpio = valor.trim();
  if (!limpio) {
    return null;
  }
  if (limpio.toLowerCase().startsWith('bearer ')) {
    const sinPrefijo = limpio.slice(7).trim();
    return sinPrefijo.length > 0 ? sinPrefijo : null;
  }
  return limpio;
}

/**
 * Extrae el token JWT del handshake de Socket.io siguiendo el orden de prioridad:
 * 1. `handshake.auth.token` (contrato oficial SPEC §6.2)
 * 2. `handshake.headers.authorization` (cabecera HTTP estándar)
 * 3. `handshake.query.token` (fallback por query string)
 */
export function extraerTokenHandshake(
  client: Pick<Socket, 'handshake'> | undefined | null,
): string | null {
  const handshake = client?.handshake;
  if (!handshake) {
    return null;
  }

  const tokenAuth = normalizarBearerToken(handshake.auth?.token);
  if (tokenAuth) {
    return tokenAuth;
  }

  const headerAuth = handshake.headers?.authorization;
  const valorHeader = Array.isArray(headerAuth) ? headerAuth[0] : headerAuth;
  const tokenHeader = normalizarBearerToken(valorHeader);
  if (tokenHeader) {
    return tokenHeader;
  }

  const queryToken = handshake.query?.token;
  const valorQuery = Array.isArray(queryToken) ? queryToken[0] : queryToken;
  return normalizarBearerToken(valorQuery);
}

/**
 * Verifica la firma HS256 y la vigencia (`exp`) de un token JWT sin dependencias externas.
 */
export function verificarTokenJwtHs256(
  token: string | null | undefined,
  secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
): WsJwtPayload | null {
  const tokenNormalizado = normalizarBearerToken(token);
  if (!tokenNormalizado) {
    return null;
  }

  const partes = tokenNormalizado.split('.');
  if (partes.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = partes;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  const header = decodificarBase64UrlJson<JwtHeader>(headerB64);
  if (header?.alg !== 'HS256') {
    return null;
  }

  const firmaEsperadaB64 = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const bufRecibida = Buffer.from(signatureB64, 'utf-8');
  const bufEsperada = Buffer.from(firmaEsperadaB64, 'utf-8');
  if (bufRecibida.length !== bufEsperada.length || !timingSafeEqual(bufRecibida, bufEsperada)) {
    return null;
  }

  const payload = decodificarBase64UrlJson<Record<string, unknown>>(payloadB64);
  if (!payload) {
    return null;
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    return null;
  }

  if (typeof payload.exp === 'number') {
    const ahoraSegundos = Math.floor(Date.now() / 1000);
    if (payload.exp <= ahoraSegundos) {
      return null;
    }
  }

  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((rol): rol is string => typeof rol === 'string')
    : undefined;

  return {
    ...payload,
    sub,
    ...(roles ? { roles } : {}),
  };
}

/**
 * Genera un token JWT firmado con HS256 (útil para pruebas de integración y desarrollo local).
 */
export function firmarTokenJwtHs256(
  payload: WsJwtPayload,
  secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
): string {
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf-8').toString(
    'base64url',
  );
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signatureB64 = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}
