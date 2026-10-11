import type { HealthDto } from '@floor/shared';
import { http, HttpResponse } from 'msw';

export const operacionHandlers = [
  // GET /health
  http.get('*/health', () => {
    const health: HealthDto = {
      status: 'ok',
      db: 'up',
      broker: 'up',
    };
    return HttpResponse.json(health, { status: 200 });
  }),
];
