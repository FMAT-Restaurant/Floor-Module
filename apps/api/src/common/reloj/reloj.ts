import { Injectable } from '@nestjs/common';

export const ZONA_HORARIA_RESTAURANTE_DEFAULT = 'America/Merida';

export function instanteAHoraParedRestaurante(
  instante: Date,
  timeZone = process.env.RESTAURANT_TIME_ZONE ||
    process.env.VITE_RESTAURANT_TIME_ZONE ||
    ZONA_HORARIA_RESTAURANTE_DEFAULT,
): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const partes = Object.fromEntries(
    formatter.formatToParts(instante).map(({ type, value }) => [type, value]),
  );
  const ms = String(instante.getMilliseconds()).padStart(3, '0');
  return new Date(
    `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}.${ms}Z`,
  );
}

/** Reloj inyectable: permite fijar "ahora" en las pruebas sin tocar el reloj del sistema. */
@Injectable()
export class Reloj {
  ahora(): Date {
    return new Date();
  }
}

/**
 * Devuelve el instante actual expresado como fecha/hora de pared del restaurante en UTC
 * (`YYYY-MM-DDTHH:mm:ss.sssZ`), consistente con `construirTstzRange` y el trigger
 * `reserva_calcular_rango` de PostgreSQL (`(fecha_reserva + hora_inicio) AT TIME ZONE 'UTC'`).
 */
export function obtenerAhoraRestaurante(reloj?: { ahora(): Date }): Date {
  if (!reloj) {
    return instanteAHoraParedRestaurante(new Date());
  }
  if (reloj instanceof Reloj) {
    return instanteAHoraParedRestaurante(reloj.ahora());
  }
  return reloj.ahora();
}
