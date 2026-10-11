import { ApiError } from './error';

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  params?: Record<string, unknown> | URLSearchParams;
  token?: string | null;
}

let customBaseUrl: string | null = null;
let inMemoryToken: string | null = null;

export function setBaseUrl(url: string | null): void {
  customBaseUrl = url;
}

export function getBaseUrl(): string {
  if (customBaseUrl !== null) {
    return customBaseUrl;
  }
  return import.meta.env.VITE_API_BASE_URL || '/sala';
}

export function getSessionToken(): string | null {
  if (inMemoryToken !== null) {
    return inMemoryToken;
  }
  if (typeof window !== 'undefined') {
    try {
      return (
        window.sessionStorage?.getItem('auth_token') ||
        window.sessionStorage?.getItem('token') ||
        window.localStorage?.getItem('auth_token') ||
        window.localStorage?.getItem('token') ||
        null
      );
    } catch {
      return null;
    }
  }
  return null;
}

export function setSessionToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        window.sessionStorage?.setItem('auth_token', token);
      } else {
        window.sessionStorage?.removeItem('auth_token');
        window.sessionStorage?.removeItem('token');
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

export function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return '00000000-0000-4000-8000-000000000000';
}

function stripTrailingSlashes(str: string): string {
  let result = str;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

function resolveFullPath(path: string, base: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/sala') && cleanPath.startsWith('/sala')) {
    return `${base}${cleanPath.slice('/sala'.length)}`;
  }
  if (cleanPath.startsWith(base)) {
    return cleanPath;
  }
  return `${base}${cleanPath}`;
}

function appendQueryParams(
  url: string,
  params?: Record<string, unknown> | URLSearchParams,
): string {
  if (!params) {
    return url;
  }
  const searchParams = new URLSearchParams();
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      searchParams.append(key, value);
    });
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        searchParams.append(key, String(value));
      }
    }
  }
  const queryString = searchParams.toString();
  if (!queryString) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${queryString}`;
}

export function buildUrl(path: string, params?: Record<string, unknown> | URLSearchParams): string {
  const base = stripTrailingSlashes(getBaseUrl());
  const fullPath = resolveFullPath(path, base);
  return appendQueryParams(fullPath, params);
}

function createRequestHeaders(options: RequestOptions, hasBody: boolean): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', generateCorrelationId());
  }
  const token = options.token ?? getSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body === 'string') {
    return body;
  }
  return JSON.stringify(body);
}

function parseErrorResponse(response: Response, rawText: string): ApiError {
  let errorData: {
    statusCode?: number;
    code?: string;
    message?: string;
    details?: unknown;
  } = {};

  if (rawText) {
    try {
      errorData = JSON.parse(rawText);
    } catch {
      // Non-JSON error payload
    }
  }

  const statusCode =
    typeof errorData.statusCode === 'number' ? errorData.statusCode : response.status;
  const code =
    typeof errorData.code === 'string' && errorData.code.length > 0
      ? errorData.code
      : `HTTP_${response.status}`;
  const message =
    typeof errorData.message === 'string' && errorData.message.length > 0
      ? errorData.message
      : response.statusText || `Petición fallida con estado ${response.status}`;

  return new ApiError(statusCode, code, message, errorData.details);
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }
  const text = await response.text();
  if (!text?.trim()) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { params, token: _token, headers: _headers, ...fetchInit } = options;
  const url = buildUrl(path, params);
  const headers = createRequestHeaders(options, body !== undefined);
  const serializedBody = serializeBody(body);

  const response = await fetch(url, {
    ...fetchInit,
    method,
    headers,
    body: serializedBody,
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    throw parseErrorResponse(response, rawText);
  }

  return parseSuccessResponse<T>(response);
}

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('GET', path, undefined, options);
  },
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body, options);
  },
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PATCH', path, body, options);
  },
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, body, options);
  },
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, options);
  },
};
