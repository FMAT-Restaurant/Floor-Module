import { HttpStatus } from '@nestjs/common';
import { EstadoReserva } from '@floor/shared';
import { CODIGO_ERROR } from '../../../common/errors/codigos-error';
import { DomainException } from '../../../common/errors/domain.exception';

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PATRON_HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MINUTOS_POR_DIA = 24 * 60;
const DURACION_MINIMA_MINUTOS = 15;
const DURACION_MAXIMA_MINUTOS = 480;

export interface RangoTemporalReserva {
  inicio: Date;
  fin: Date;
  literal: string;
}

export function validarFecha(fecha: string): void {
  if (!PATRON_FECHA.test(fecha)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La solicitud contiene datos inválidos',
      { errores: [{ campo: 'fecha', mensaje: 'La fecha debe tener formato YYYY-MM-DD' }] },
    );
  }
}

export function horaAMinutos(hora: string): number {
  if (!PATRON_HORA.test(hora)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La solicitud contiene datos inválidos',
      {
        errores: [{ campo: 'horaInicio', mensaje: 'La hora debe tener formato HH:mm (24 horas)' }],
      },
    );
  }
  const [horasTexto, minutosTexto] = hora.split(':');
  return Number(horasTexto) * 60 + Number(minutosTexto);
}

export function minutosAHora(totalMinutos: number): string {
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

/**
 * RN-10 · SPEC §8: calcula `horaFin` sumando la duración en minutos (`15..480`) a `horaInicio`.
 * Rechaza con 400 si la duración está fuera de rango o si la reserva cruza la medianoche
 * (`hora_fin > hora_inicio` dentro de la misma `fecha_reserva`).
 */
export function calcularHoraFin(horaInicio: string, duracionMinutos: number): string {
  const inicioMinutos = horaAMinutos(horaInicio);
  if (
    !Number.isInteger(duracionMinutos) ||
    duracionMinutos < DURACION_MINIMA_MINUTOS ||
    duracionMinutos > DURACION_MAXIMA_MINUTOS
  ) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La duración debe ser un entero entre 15 y 480 minutos',
      {
        errores: [
          {
            campo: 'duracion',
            mensaje: 'La duración debe estar entre 15 y 480 minutos',
          },
        ],
      },
    );
  }

  const finMinutos = inicioMinutos + duracionMinutos;
  if (finMinutos >= MINUTOS_POR_DIA) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La reserva debe finalizar dentro del mismo día de servicio',
      {
        errores: [
          {
            campo: 'duracion',
            mensaje: 'El horario de fin no puede cruzar la medianoche',
          },
        ],
      },
    );
  }

  return minutosAHora(finMinutos);
}

export function calcularDuracionMinutos(horaInicio: string, horaFin: string): number {
  return horaAMinutos(horaFin) - horaAMinutos(horaInicio);
}

/**
 * Construye el rango temporal semiabierto `[inicio, fin)` en UTC consistente con el trigger
 * `reserva_calcular_rango` de PostgreSQL (`tstzrange((fecha + hora_inicio) AT TIME ZONE 'UTC', ...)`).
 */
export function construirTstzRange(
  fecha: string,
  horaInicio: string,
  horaFin: string,
): RangoTemporalReserva {
  validarFecha(fecha);
  const inicioMin = horaAMinutos(horaInicio);
  const finMin = horaAMinutos(horaFin);
  if (finMin <= inicioMin) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La hora de fin debe ser posterior a la hora de inicio',
      { horaInicio, horaFin },
    );
  }

  const inicioIso = `${fecha}T${horaInicio}:00.000Z`;
  const finIso = `${fecha}T${horaFin}:00.000Z`;
  return {
    inicio: new Date(inicioIso),
    fin: new Date(finIso),
    literal: `[${inicioIso},${finIso})`,
  };
}

/**
 * RN-11 · SPEC §4.2: sólo una reserva en estado `Confirmada` admite reprogramación o cancelación.
 * Si ya está `Completada`, `Cancelada` o `No-show`, no puede modificarse.
 */
export function esEstadoModificable(estado: EstadoReserva): boolean {
  return estado === EstadoReserva.CONFIRMADA;
}
