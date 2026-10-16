import { EstadoReserva, type ReservaDto } from '@floor/shared';

// La agenda REST expresa fecha y hora en la zona horaria local del restaurante.
export function getFechaLocalHoy(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function esReservaConfirmadaFutura(reserva: ReservaDto, ahora = new Date()): boolean {
  return (
    reserva.estado === EstadoReserva.CONFIRMADA &&
    new Date(`${reserva.fecha}T${reserva.horaInicio}:00`).getTime() > ahora.getTime()
  );
}
