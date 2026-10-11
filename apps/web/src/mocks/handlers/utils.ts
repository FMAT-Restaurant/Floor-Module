import type { z } from 'zod';
import { HttpResponse } from 'msw';
import { MockApiError } from '../db';

export function extractQueryParams(urlStr: string): Record<string, string> {
  const url = new URL(urlStr);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });
  return queryParams;
}

export function validationErrorResponse(message: string, error: z.ZodError) {
  return HttpResponse.json(
    {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten(),
    },
    { status: 400 },
  );
}

export function handleMockError(err: unknown, defaultMessage: string) {
  if (err instanceof MockApiError) {
    return HttpResponse.json(err.toResponse(), { status: err.statusCode });
  }
  return HttpResponse.json(
    {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: defaultMessage,
    },
    { status: 500 },
  );
}
