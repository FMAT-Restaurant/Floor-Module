import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { LiberarUnionResponseDto } from '@floor/shared';
import { liberarUnion } from '../../api/services/uniones.service';
import { queryKeys } from '../../api/queryKeys';
import { isApiError } from '../../api/error';
import { formatListaMesas } from '../../lib/uniones';
import { Modal } from '../Modal';

export interface LiberarUnionModalProps {
  readonly unionId: string;
  readonly numerosMesa: readonly number[];
  readonly onClose: () => void;
  readonly onSuccess: (response: LiberarUnionResponseDto) => void;
}

const secondaryClass =
  'h-control px-4 border border-border bg-surface text-text text-sm font-medium rounded-control hover:bg-canvas inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';
const primaryClass =
  'h-control px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-control inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed';

export function LiberarUnionModal({
  unionId,
  numerosMesa,
  onClose,
  onSuccess,
}: Readonly<LiberarUnionModalProps>): React.JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const liberarMutation = useMutation({
    mutationFn: () => liberarUnion(unionId),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.uniones.all }),
      ]);
      onSuccess(response);
    },
    onError: (err) => {
      setError(
        isApiError(err)
          ? `No se pudo liberar la unión: ${err.message}`
          : 'No se pudo liberar la unión. Revisa tu conexión e inténtalo de nuevo.',
      );
    },
  });

  const pending = liberarMutation.isPending;
  const lista = formatListaMesas(numerosMesa);

  return (
    <Modal
      title="Liberar unión de mesas"
      description={`Las mesas ${lista} se separarán y pasarán a Limpieza pendiente. Confirma que los comensales ya se retiraron.`}
      pending={pending}
      onClose={onClose}
    >
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          setError(null);
          liberarMutation.mutate();
        }}
      >
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
          <button type="button" className={secondaryClass} onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={primaryClass} disabled={pending}>
            {pending && (
              <Loader2
                className="w-4 h-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {pending ? 'Liberando…' : 'Confirmar liberación'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
