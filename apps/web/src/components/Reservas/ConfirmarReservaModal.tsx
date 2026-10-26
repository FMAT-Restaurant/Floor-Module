import { EstadoReserva, type ReservaDto } from '@floor/shared';
import { cancelarReserva, noShowReserva } from '../../api/services/reservas.service';
import { puedeRegistrarNoShow } from '../../lib/reservas';
import { Modal } from '../Modal';
import { useReservaMutation } from './useReservaMutation';

interface Props {
  readonly reserva: ReservaDto;
  readonly mesaLabel: string;
  readonly accion: 'cancelar' | 'no-show';
  readonly ahora: Date;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}
export function ConfirmarReservaModal({
  reserva,
  mesaLabel,
  accion,
  ahora,
  onClose,
  onSuccess,
}: Props) {
  const cancelar = accion === 'cancelar';
  const titulo = cancelar ? 'Cancelar reserva' : 'Registrar No-show';
  const mutation = useReservaMutation(
    () => (cancelar ? cancelarReserva(reserva.reservaId) : noShowReserva(reserva.reservaId)),
    onSuccess,
  );
  const permitida =
    reserva.estado === EstadoReserva.CONFIRMADA &&
    (cancelar || puedeRegistrarNoShow(reserva, ahora));
  return (
    <Modal
      title={titulo}
      description={
        cancelar
          ? 'La reserva pasará a Cancelada y su franja horaria quedará disponible.'
          : 'Confirma que los clientes no se han presentado tras la tolerancia. La reserva pasará a No-show y su franja quedará disponible.'
      }
      pending={mutation.isPending}
      onClose={onClose}
    >
      <div className="mt-4 space-y-4">
        <p className="text-sm text-text">
          {reserva.nombreContacto} · {mesaLabel} · {reserva.fecha} · {reserva.horaInicio}–
          {reserva.horaFin}
        </p>
        {!permitida && (
          <p role="alert" className="text-sm text-amber-800">
            Esta acción ya no está disponible para la reserva.
          </p>
        )}
        {mutation.errorMessage && (
          <p role="alert" className="text-sm text-red-700">
            {mutation.errorMessage}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onClose}
            className="h-control px-4 border border-border rounded-control text-sm font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            Volver a la agenda
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !permitida}
            onClick={() => {
              if (mutation.isPending || !permitida || (!cancelar && !puedeRegistrarNoShow(reserva)))
                return;
              mutation.clearError();
              mutation.mutate(undefined);
            }}
            className={`h-control px-4 rounded-control text-sm font-medium text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary ${cancelar ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'}`}
          >
            {mutation.isPending ? 'Guardando…' : titulo}
          </button>
        </div>
      </div>
    </Modal>
  );
}
