import { createHmac, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, type AuthenticatedUser } from '../auth/auth.decorators';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';

export const JWT_ISSUER = 'urn:fmat:restaurant:auth';
export const DEFAULT_JWT_SECRET = 'fmat-restaurant-auth-secret-key-2026';

export const HEADER_USER_ID = 'x-user-id';
export const HEADER_STAFF_ID = 'x-staff-id';
export const HEADER_USER_ROLES = 'x-user-roles';
export const HEADER_USER_PERMISSIONS = 'x-user-permissions';

export interface RequestConIdentidad extends Request {
  user?: AuthenticatedUser;
  correlationId?: string;
}

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
}

interface JwtPayload {
  sub?: unknown;
  userId?: unknown;
  staffId?: unknown;
  roles?: unknown;
  role?: unknown;
  permissions?: unknown;
  iss?: unknown;
  exp?: unknown;
  nbf?: unknown;
}

function leerCabecera(headers: Record<string, unknown>, nombre: string): string | undefined {
  const valor = headers[nombre] ?? headers[nombre.toLowerCase()];
  if (Array.isArray(valor)) {
    const primero = valor[0];
    return typeof primero === 'string' ? primero.trim() : undefined;
  }
  return typeof valor === 'string' ? valor.trim() : undefined;
}

function parsearListaSeparadaPorComas(valor: string | undefined): string[] {
  if (!valor) {
    return [];
  }
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsearListaClaim(valor: unknown): string[] {
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

/**
 * BE-011 · Guard de autenticación perimetral (Kong) con fallback local JWT HS256
 * (SPEC.md §1, ARCHITECTURE.md §8, ADR-007).
 * - Consume `X-User-Id`, `X-Staff-Id`, `X-User-Roles` y `X-User-Permissions` inyectadas por Kong.
 * - Ignora `X-Password-Temporary` (filtrado perimetralmente por Kong).
 * - Si las cabeceras de Kong no están presentes, valida el token Bearer JWT con firma HS256
 *   y emisor estricto `urn:fmat:restaurant:auth`.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.esRutaPublica(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConIdentidad>();
    const headers = (request?.headers ?? {}) as Record<string, unknown>;

    const identidadKong = this.extraerIdentidadDesdeKong(headers);
    if (identidadKong !== null) {
      request.user = identidadKong;
      return true;
    }

    const identidadJwt = this.extraerIdentidadDesdeJwt(headers);
    if (identidadJwt !== null) {
      request.user = identidadJwt;
      return true;
    }

    throw new DomainException(
      HttpStatus.UNAUTHORIZED,
      CODIGO_ERROR.NO_AUTENTICADO,
      'Credenciales de identidad faltantes o inválidas',
    );
  }

  private esRutaPublica(context: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return Boolean(esPublico);
  }

  private extraerIdentidadDesdeKong(headers: Record<string, unknown>): AuthenticatedUser | null {
    const rawUserId = leerCabecera(headers, HEADER_USER_ID);
    const rawRoles = leerCabecera(headers, HEADER_USER_ROLES);

    if (rawUserId === undefined && rawRoles === undefined) {
      return null;
    }

    const roles = parsearListaSeparadaPorComas(rawRoles);
    if (!rawUserId || roles.length === 0) {
      return null;
    }

    const rawStaffId = leerCabecera(headers, HEADER_STAFF_ID);
    const rawPermissions = leerCabecera(headers, HEADER_USER_PERMISSIONS);

    return {
      userId: rawUserId,
      staffId: rawStaffId && rawStaffId.length > 0 ? rawStaffId : undefined,
      roles,
      permissions: parsearListaSeparadaPorComas(rawPermissions),
    };
  }

  private extraerIdentidadDesdeJwt(headers: Record<string, unknown>): AuthenticatedUser | null {
    const authHeader = leerCabecera(headers, 'authorization');
    if (!authHeader) {
      return null;
    }

    const coincidencia = /^Bearer\s+(\S+)$/i.exec(authHeader);
    if (!coincidencia) {
      return null;
    }

    const partes = coincidencia[1].split('.');
    if (partes.length !== 3 || partes.some((p) => p.length === 0)) {
      return null;
    }

    const [headerB64, payloadB64, firmaB64] = partes;
    const header = decodificarJsonBase64Url<JwtHeader>(headerB64);
    if (!header || header.alg !== 'HS256') {
      return null;
    }

    const secreto = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
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

    const sub =
      typeof payload.sub === 'string' && payload.sub.trim().length > 0
        ? payload.sub.trim()
        : typeof payload.userId === 'string' && payload.userId.trim().length > 0
          ? payload.userId.trim()
          : '';
    if (!sub) {
      return null;
    }

    const roles = parsearListaClaim(payload.roles ?? payload.role);
    const permissions = parsearListaClaim(payload.permissions);
    const staffId =
      typeof payload.staffId === 'string' && payload.staffId.trim().length > 0
        ? payload.staffId.trim()
        : undefined;

    return {
      userId: sub,
      staffId,
      roles,
      permissions,
    };
  }
}
