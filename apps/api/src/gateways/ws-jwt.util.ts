import type { Socket } from 'socket.io';
import {
  DEFAULT_JWT_SECRET,
  firmarJwtHs256,
  JWT_ISSUER,
  normalizarBearerToken,
  verificarJwtHs256,
} from '../common/auth/jwt-hs256.util';

export { DEFAULT_JWT_SECRET, JWT_ISSUER };

export interface WsJwtPayload {
  sub: string;
  staffId?: string;
  roles?: string[];
  iss?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  mustChangePassword?: boolean;
  [claim: string]: unknown;
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
 * Verifica la firma HS256, algoritmo, emisor (`urn:fmat:restaurant:auth`), vigencia (`exp`, `nbf`),
 * formato UUID v4 en `sub` y ausencia de `mustChangePassword === true` reutilizando la
 * utilidad común de BE-011 (`jwt-hs256.util.ts`).
 */
export function verificarTokenJwtHs256(
  token: string | null | undefined,
  secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
): WsJwtPayload | null {
  const verificado = verificarJwtHs256(token, {
    secret,
    lanzarEnPasswordTemporal: false,
  });
  if (!verificado) {
    return null;
  }

  return {
    ...(verificado.payload as Record<string, unknown>),
    sub: verificado.sub,
    staffId: verificado.staffId,
    roles: verificado.roles.length > 0 ? verificado.roles : undefined,
    iss: verificado.iss,
    iat: verificado.iat,
    exp: verificado.exp,
    nbf: verificado.nbf,
    mustChangePassword: verificado.mustChangePassword,
  };
}

/**
 * Genera un token JWT firmado con HS256 (útil para pruebas de integración y desarrollo local).
 */
export function firmarTokenJwtHs256(
  payload: Record<string, unknown>,
  secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
): string {
  return firmarJwtHs256(payload, secret);
}
