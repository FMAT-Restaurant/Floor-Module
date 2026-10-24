import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { RequestConIdentidad } from '../guards/identity.guard';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export function resolverCorrelationId(headers?: Record<string, unknown>): string {
  const raw = headers?.[CORRELATION_ID_HEADER];
  const candidato = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidato === 'string' && candidato.trim().length > 0) {
    return candidato.trim();
  }
  return randomUUID();
}

/**
 * BE-011 · Interceptor de trazabilidad distribuida (SPEC.md §1, ARCHITECTURE.md §9, RNF-011).
 * Extrae `x-correlation-id` de la petición (o genera un UUID v4 si no viene),
 * lo adjunta en las cabeceras de respuesta y emite un log estructurado en JSON al finalizar.
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorrelationInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestConIdentidad>();
    const response = http.getResponse<Response>();

    const headers = (request?.headers ?? {}) as Record<string, unknown>;
    const correlationId = resolverCorrelationId(headers);

    if (request) {
      request.correlationId = correlationId;
      if (request.headers) {
        request.headers[CORRELATION_ID_HEADER] = correlationId;
      }
    }

    if (typeof response?.setHeader === 'function') {
      response.setHeader(CORRELATION_ID_HEADER, correlationId);
    }

    const inicio = Date.now();
    const registrar = (): void => {
      const registroLog = {
        correlationId,
        method: request?.method ?? 'UNKNOWN',
        route: request?.originalUrl ?? request?.url ?? '/',
        statusCode: response?.statusCode ?? 200,
        userId: request?.user?.userId ?? null,
        durationMs: Date.now() - inicio,
      };
      this.logger.log(JSON.stringify(registroLog));
    };

    return next.handle().pipe(
      tap({
        next: () => registrar(),
        error: () => registrar(),
      }),
    );
  }
}
