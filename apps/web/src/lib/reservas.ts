import { EstadoReserva, type ReservaDto } from '@floor/shared';

// SPEC §1: fecha y hora se expresan en la zona del restaurante, no del dispositivo.
export const RESTAURANT_TIME_ZONE = import.meta.env.VITE_RESTAURANT_TIME_ZONE || 'America/Merida';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: RESTAURANT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getPartesRestaurante(instante: Date) {
  return Object.fromEntries(
    formatter.formatToParts(instante).map(({ type, value }) => [type, value]),
  );
}

export function getFechaLocalHoy(now = new Date()): string {
  const { year, month, day } = getPartesRestaurante(now);
  return `${year}-${month}-${day}`;
}

export function getHoraLocalAhora(now = new Date()): string {
  const { hour, minute } = getPartesRestaurante(now);
  return `${hour}:${minute}`;
}

// Convierte la hora de pared del restaurante en un instante UTC usando su zona IANA.
function getInicioReserva(fecha: string, hora: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora)) return NaN;
  const pared = Date.parse(`${fecha}T${hora}:00Z`);
  if (!Number.isFinite(pared) || new Date(pared).toISOString().slice(0, 10) !== fecha) return NaN;
  let instante = pared;
  for (let intento = 0; intento < 4; intento += 1) {
    const { year, month, day, hour, minute, second } = getPartesRestaurante(new Date(instante));
    const representado = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    const diferencia = pared - representado;
    if (diferencia === 0) return instante;
    instante += diferencia;
  }
  // Una hora inexistente durante un salto de horario no se puede reservar.
  return NaN;
}

export function esReservaConfirmadaFutura(reserva: ReservaDto, ahora = new Date()): boolean {
  return (
    reserva.estado === EstadoReserva.CONFIRMADA &&
    esInicioReservaFuturo(reserva.fecha, reserva.horaInicio, ahora)
  );
}

const toleranciaConfigurada = Number(import.meta.env.VITE_RESERVA_NO_SHOW_TOLERANCIA_MINUTOS ?? 15);
export const NO_SHOW_TOLERANCIA_MINUTOS =
  Number.isFinite(toleranciaConfigurada) && toleranciaConfigurada >= 0 ? toleranciaConfigurada : 15;

export function puedeRegistrarNoShow(
  reserva: ReservaDto,
  ahora = new Date(),
  tolerancia = NO_SHOW_TOLERANCIA_MINUTOS,
): boolean {
  return (
    reserva.estado === EstadoReserva.CONFIRMADA &&
    ahora.getTime() > getInicioReserva(reserva.fecha, reserva.horaInicio) + tolerancia * 60_000
  );
}

export function getDuracionReserva(reserva: ReservaDto): number {
  const minutos = (hora: string) => {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  };
  return (minutos(reserva.horaFin) - minutos(reserva.horaInicio) + 1440) % 1440;
}

export function esInicioReservaFuturo(fecha: string, hora: string, ahora = new Date()): boolean {
  return getInicioReserva(fecha, hora) > ahora.getTime();
}
