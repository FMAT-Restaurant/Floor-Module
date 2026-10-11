import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000, // 10 segundos
      retry: (failureCount, error) => {
        // No reintentar ante errores de cliente de negocio (400, 401, 403, 404, 409)
        if (error instanceof ApiError && error.statusCode < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
  },
});
