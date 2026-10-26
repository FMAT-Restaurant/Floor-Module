import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { CORRELATION_ID_HEADER, CorrelationInterceptor } from './correlation.interceptor';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function crearContextoInterceptor(opciones?: {
  headers?: Record<string, unknown>;
  method?: string;
  originalUrl?: string;
  statusCode?: number;
  userId?: string;
}) {
  const setHeader = jest.fn();
  const request: Record<string, unknown> = {
    headers: opciones?.headers ?? {},
    method: opciones?.method ?? 'GET',
    originalUrl: opciones?.originalUrl ?? '/api/v1/floor/mesas',
    user: opciones?.userId
      ? { userId: opciones.userId, roles: ['MESERO'], permissions: [] }
      : undefined,
  };
  const response = {
    statusCode: opciones?.statusCode ?? 200,
    setHeader,
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, request, response, setHeader };
}

describe('CorrelationInterceptor (BE-011, SPEC §1, ARCHITECTURE §9, RNF-011)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extrae x-correlation-id entrante, lo adjunta en la respuesta y lo propaga en logs JSON', async () => {
    const interceptor = new CorrelationInterceptor();
    const correlationId = 'c1000000-0000-4000-8000-000000000099';
    const userId = 'e1000000-0000-4000-8000-000000000001';
    const { context, request, setHeader } = crearContextoInterceptor({
      headers: { [CORRELATION_ID_HEADER]: correlationId },
      method: 'POST',
      originalUrl: '/api/v1/floor/mesas',
      statusCode: 201,
      userId,
    });
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const resultado = await lastValueFrom(interceptor.intercept(context, next));

    expect(resultado).toEqual({ ok: true });
    expect(request.correlationId).toBe(correlationId);
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, correlationId);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const logParseado = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logParseado).toMatchObject({
      correlationId,
      method: 'POST',
      route: '/api/v1/floor/mesas',
      statusCode: 201,
      userId,
    });
    expect(typeof logParseado.durationMs).toBe('number');
  });

  it('genera un UUID v4 cuando no viene x-correlation-id o está vacío', async () => {
    const interceptor = new CorrelationInterceptor();
    const { context, request, setHeader } = crearContextoInterceptor({
      headers: { [CORRELATION_ID_HEADER]: '   ' },
    });
    const next: CallHandler = { handle: () => of([]) };

    await lastValueFrom(interceptor.intercept(context, next));

    const generado = request.correlationId as string;
    expect(generado).toMatch(UUID_V4_REGEX);
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, generado);

    const logParseado = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logParseado.correlationId).toBe(generado);
    expect(logParseado.userId).toBeNull();
  });

  it('propaga x-correlation-id en logs JSON incluso cuando el controlador lanza una excepción', async () => {
    const interceptor = new CorrelationInterceptor();
    const correlationId = 'c1000000-0000-4000-8000-000000000055';
    const { context, setHeader } = crearContextoInterceptor({
      headers: { [CORRELATION_ID_HEADER]: [correlationId] },
    });
    const next: CallHandler = {
      handle: () => throwError(() => new Error('Fallo simulado')),
    };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toThrow(
      'Fallo simulado',
    );
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, correlationId);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      correlationId,
    });
  });
});
