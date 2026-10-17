import { EstadoReserva } from '@floor/shared';

/** RN-08: ventana por defecto (minutos) para considerar una reserva "próxima". */
export const VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN = 30;

const MS_POR_MINUTO = 60_000;

export interface ReservaAgendada {
  /** Instante de inicio de la reserva. */
  inicio: Date;
  estado: EstadoReserva;
}

/**
 * Interpreta RESERVA_PROXIMA_VENTANA_MINUTOS: entero >= 1; cualquier otro valor usa el default.
 */
export function resolverVentanaMinutos(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 ? numero : VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN;
}

/** RN-08: reserva Confirmada con inicio en el intervalo cerrado [ahora, ahora + V]. */
export function esReservaProxima(
  reserva: ReservaAgendada,
  ahora: Date,
  ventanaMinutos: number,
): boolean {
  if (reserva.estado !== EstadoReserva.CONFIRMADA) {
    return false;
  }
  const inicio = reserva.inicio.getTime();
  const desde = ahora.getTime();
  const hasta = desde + ventanaMinutos * MS_POR_MINUTO;
  return inicio >= desde && inicio <= hasta;
}

export function tieneReservaProxima(
  reservas: readonly ReservaAgendada[],
  ahora: Date,
  ventanaMinutos: number = VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN,
): boolean {
  return reservas.some((reserva) => esReservaProxima(reserva, ahora, ventanaMinutos));
}
