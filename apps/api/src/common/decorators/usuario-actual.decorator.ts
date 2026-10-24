import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const DEFAULT_MESERO_ID = 'd1000000-0000-4000-8000-000000000001';

export interface UsuarioAutenticado {
  id?: string;
  sub?: string;
  userId?: string;
  meseroId?: string;
  staffId?: string;
  roles?: string[];
}

function normalizarCadena(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : undefined;
}

function extraerDesdeObjetoUsuario(usuario: unknown): string | undefined {
  const directo = normalizarCadena(usuario);
  if (directo) return directo;

  if (typeof usuario !== 'object' || usuario === null) {
    return undefined;
  }

  const candidato = usuario as Record<string, unknown>;
  return (
    normalizarCadena(candidato.meseroId) ??
    normalizarCadena(candidato.id) ??
    normalizarCadena(candidato.sub) ??
    normalizarCadena(candidato.userId)
  );
}

function extraerSubDeJwt(authorizationHeader: unknown): string | undefined {
  const header = normalizarCadena(authorizationHeader);
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  const token = header.slice(7).trim();
  const partes = token.split('.');
  if (partes.length < 2) return undefined;

  try {
    const json = Buffer.from(partes[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(json) as Record<string, unknown>;
    return (
      normalizarCadena(payload.sub) ??
      normalizarCadena(payload.userId) ??
      normalizarCadena(payload.id)
    );
  } catch {
    return undefined;
  }
}

export function extraerMeseroDeRequest(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const req = request as {
    user?: unknown;
    headers?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };

  const desdeUser = extraerDesdeObjetoUsuario(req.user);
  if (desdeUser) return desdeUser;

  const headers = req.headers ?? {};
  const desdeHeader =
    normalizarCadena(headers['x-user-id']) ??
    normalizarCadena(headers['x-mesero-id']) ??
    extraerSubDeJwt(headers.authorization);
  if (desdeHeader) return desdeHeader;

  return normalizarCadena(req.body?.meseroId);
}

export function resolverMeseroId(
  usuario?: UsuarioAutenticado | string | null,
  meseroIdDto?: string,
): string {
  return extraerDesdeObjetoUsuario(usuario) ?? normalizarCadena(meseroIdDto) ?? DEFAULT_MESERO_ID;
}

/**
 * Decorador de parámetro de autenticación/usuario (SPEC §1, ARCHITECTURE §8).
 * Obtiene el identificador del mesero/usuario autenticado desde `req.user`,
 * la cabecera `X-User-Id` inyectada por el Gateway o el token Bearer.
 */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<unknown>();
    return extraerMeseroDeRequest(request);
  },
);

export const CurrentUser = UsuarioActual;
export const MeseroActual = UsuarioActual;
