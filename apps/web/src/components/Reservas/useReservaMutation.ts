import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../../api/error';
import { queryKeys } from '../../api/queryKeys';

export function useReservaMutation<T>(
  mutationFn: (data: T) => Promise<unknown>,
  onSuccess: () => void,
) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn,
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all }),
      ]);
      onSuccess();
    },
    onError: (failure) => {
      if (isApiError(failure) && failure.code === 'RESERVA_SOLAPADA') {
        setError(
          'La mesa ya tiene una reserva en ese horario. Elige otra mesa u horario. Tus datos se han conservado.',
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all });
      } else if (
        isApiError(failure) &&
        (failure.code === 'TRANSICION_INVALIDA' || failure.statusCode === 404)
      ) {
        setError(
          'La reserva o la mesa cambió, o esta operación ya no está permitida. Revisa la agenda e inténtalo de nuevo.',
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      } else {
        setError(
          isApiError(failure)
            ? failure.message
            : 'No se pudo guardar la operación. Revisa tu conexión e inténtalo de nuevo.',
        );
      }
    },
  });
  return { ...mutation, errorMessage: error, clearError: () => setError(null) };
}
