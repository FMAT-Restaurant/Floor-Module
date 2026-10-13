import { EstadoReserva, type ReservaDto } from '@floor/shared';

// La agenda REST expresa fecha y hora en la zona horaria local del restaurante.
export function esReservaConfirmadaFutura(reserva: ReservaDto, ahora = new Date()): boolean {
  return (
    reserva.estado === EstadoReserva.CONFIRMADA &&
    new Date(`${reserva.fecha}T${reserva.horaInicio}:00`).getTime() > ahora.getTime()
  );
}
