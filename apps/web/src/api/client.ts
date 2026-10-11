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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildUrl(path: string, params?: Record<string, unknown> | URLSearchParams): string {
  const base = getBaseUrl().replace(/\/+$/, '');
  let fullPath: string;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    fullPath = path;
  } else {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (base.endsWith('/sala') && cleanPath.startsWith('/sala')) {
      const rest = cleanPath.slice('/sala'.length);
      fullPath = `${base}${rest}`;
    } else if (cleanPath.startsWith(base)) {
      fullPath = cleanPath;
    } else {
      fullPath = `${base}${cleanPath}`;
    }
  }

  if (!params) {
    return fullPath;
  }

  const searchParams = new URLSearchParams();
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => {
      searchParams.append(key, value);
    });
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }
  }

  const queryString = searchParams.toString();
  if (!queryString) {
    return fullPath;
  }

  const separator = fullPath.includes('?') ? '&' : '?';
  return `${fullPath}${separator}${queryString}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { params, token: explicitToken, headers: customHeaders, ...fetchInit } = options;
  const url = buildUrl(path, params);

  const headers = new Headers(customHeaders);

  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', generateCorrelationId());
  }

  const token = explicitToken !== undefined ? explicitToken : getSessionToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const serializedBody =
    body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;

  const response = await fetch(url, {
    ...fetchInit,
    method,
    headers,
    body: serializedBody,
  });

  if (!response.ok) {
    let errorData: {
      statusCode?: number;
      code?: string;
      message?: string;
      details?: unknown;
    } = {};

    try {
      const rawText = await response.text();
      if (rawText) {
        errorData = JSON.parse(rawText);
      }
    } catch {
      // Response was not JSON
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

    throw new ApiError(statusCode, code, message, errorData.details);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const text = await response.text();
  if (!text || !text.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
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
