import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { EstadoMesa, EstadoReserva, type MesaDto, type MesaEnVivoDto } from '@floor/shared';
import { eliminarMesa, getMesa } from '../../api/services/mesas.service';
import { getReservas } from '../../api/services/reservas.service';
import { queryKeys } from '../../api/queryKeys';
import { isApiError } from '../../api/error';
import { esReservaConfirmadaFutura } from '../../lib/reservas';
import { Modal } from '../Modal';

interface BajaMesaModalProps {
  readonly mesa: MesaDto;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function BajaMesaModal({ mesa, onClose, onSuccess }: BajaMesaModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mesaQuery = useQuery({
    queryKey: queryKeys.mesas.detail(mesa.mesaId),
    queryFn: () => getMesa(mesa.mesaId),
    staleTime: 0,
  });
  const filters = { mesaId: mesa.mesaId, estado: EstadoReserva.CONFIRMADA };
  const reservasQuery = useQuery({
    queryKey: queryKeys.reservas.list(filters),
    queryFn: () => getReservas(filters),
    staleTime: 0,
  });
  const actual = mesaQuery.data ?? mesa;
  const reservas =
    reservasQuery.data?.filter((reserva) => esReservaConfirmadaFutura(reserva)) ?? [];
  const checking = mesaQuery.isFetching || reservasQuery.isFetching;
  const checkFailed = mesaQuery.isError || reservasQuery.isError;
  const bloqueada =
    !actual.activo ||
    actual.estadoFisico !== EstadoMesa.LIBRE ||
    Boolean(actual.unionId) ||
    reservas.length > 0;

  const mutation = useMutation({
    mutationFn: () => eliminarMesa(mesa.mesaId),
    onSuccess: async () => {
      queryClient.setQueryData<MesaEnVivoDto[]>(queryKeys.mesas.enVivo(), (previous) =>
        previous?.filter((item) => item.mesaId !== mesa.mesaId),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all }),
      ]);
      onSuccess();
    },
    onError: (failure) => {
      setError(
        isApiError(failure)
          ? failure.message
          : 'No se pudo dar de baja la mesa. Revisa tu conexión e inténtalo de nuevo.',
      );
      if (isApiError(failure) && failure.statusCode === 409) {
        void mesaQuery.refetch();
        void reservasQuery.refetch();
      }
    },
  });

  return (
    <Modal
      title={`Dar de baja Mesa ${actual.numeroMesa}`}
      description="La mesa dejará de aparecer en el plano operativo. Su registro y su historial se conservarán."
      pending={mutation.isPending}
      onClose={onClose}
    >
      <div className="mt-4 space-y-4">
        {checking && (
          <p role="status" className="text-sm text-muted">
            Comprobando el estado y las reservas de la mesa…
          </p>
        )}
        {checkFailed && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 rounded-control p-3 text-sm text-red-800"
          >
            <p>No se pudo comprobar si la mesa puede darse de baja.</p>
            <button
              type="button"
              disabled={checking || mutation.isPending}
              onClick={() => {
                void mesaQuery.refetch();
                void reservasQuery.refetch();
              }}
              className="h-control mt-2 px-3 border border-red-200 rounded-control font-medium disabled:opacity-50"
            >
              Reintentar comprobación
            </button>
          </div>
        )}
        {!actual.activo ? (
          <p role="alert" className="text-sm text-amber-800">
            Esta mesa ya está dada de baja.
          </p>
        ) : actual.unionId ? (
          <p role="alert" className="text-sm text-amber-800">
            La mesa pertenece a una unión activa. Libera la unión antes de darla de baja.
          </p>
        ) : (
          actual.estadoFisico !== EstadoMesa.LIBRE && (
            <p role="alert" className="text-sm text-amber-800">
              Estado actual: {actual.estadoFisico}. La mesa debe quedar Libre antes de darla de
              baja.
            </p>
          )
        )}
        {reservas.length > 0 && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-200 rounded-control p-3 text-sm text-amber-900"
          >
            <p className="font-semibold">
              La mesa tiene {reservas.length}{' '}
              {reservas.length === 1 ? 'reserva confirmada futura' : 'reservas confirmadas futuras'}
              .
            </p>
            <p className="mt-1">Cancela o reasigna esas reservas antes de dar de baja la mesa.</p>
            <ul className="mt-2 space-y-1">
              {reservas.map((reserva) => (
                <li key={reserva.reservaId} className="break-words">
                  {reserva.nombreContacto} · {reserva.fecha} a las {reserva.horaInicio}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onClose}
            className="h-control px-4 border border-border rounded-control text-sm font-medium hover:bg-canvas disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={
              mutation.isPending ||
              checking ||
              checkFailed ||
              bloqueada ||
              !mesaQuery.data ||
              !reservasQuery.data
            }
            onClick={() => {
              if (mutation.isPending || checking || checkFailed || bloqueada) return;
              setError(null);
              mutation.mutate();
            }}
            className="h-control px-4 bg-red-600 hover:bg-red-700 text-white rounded-control text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-red-500"
          >
            {mutation.isPending && (
              <Loader2
                className="w-4 h-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {mutation.isPending ? 'Dando de baja…' : 'Dar de baja mesa'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
