import { EstadoReserva } from '@floor/shared';
import { CODIGO_ERROR } from '../../../common/errors/codigos-error';
import type { DomainException } from '../../../common/errors/domain.exception';
import {
  calcularDuracionMinutos,
  calcularHoraFin,
  construirTstzRange,
  esEstadoModificable,
  horaAMinutos,
  minutosAHora,
  validarFecha,
} from './rango-reserva';

function capturar(fn: () => unknown): DomainException {
  try {
    fn();
  } catch (error) {
    return error as DomainException;
  }
  throw new Error('Se esperaba una excepción');
}

describe('rango-reserva (RN-09, RN-10, RN-11)', () => {
  it('convierte entre HH:mm y minutos desde 00:00', () => {
    expect(horaAMinutos('00:00')).toBe(0);
    expect(horaAMinutos('19:30')).toBe(1170);
    expect(minutosAHora(1170)).toBe('19:30');
    expect(minutosAHora(5)).toBe('00:05');
  });

  it('rechaza formato de fecha u hora inválido con 400 VALIDACION', () => {
    expect(capturar(() => validarFecha('15-01-2030')).getStatus()).toBe(400);
    expect(capturar(() => horaAMinutos('25:00')).getResponse()).toMatchObject({
      code: CODIGO_ERROR.VALIDACION,
    });
  });

  it('calcula horaFin y duración en minutos dentro del mismo día', () => {
    expect(calcularHoraFin('18:00', 90)).toBe('19:30');
    expect(calcularDuracionMinutos('18:00', '19:30')).toBe(90);
  });

  it('rechaza duración fuera de [15, 480] o que cruce la medianoche', () => {
    expect(capturar(() => calcularHoraFin('18:00', 10)).getStatus()).toBe(400);
    expect(capturar(() => calcularHoraFin('18:00', 500)).getStatus()).toBe(400);
    expect(capturar(() => calcularHoraFin('23:00', 90)).getStatus()).toBe(400);
  });

  it('construye tstzrange semiabierto [inicio, fin) en UTC', () => {
    const rango = construirTstzRange('2030-01-15', '19:00', '20:30');
    expect(rango.inicio.toISOString()).toBe('2030-01-15T19:00:00.000Z');
    expect(rango.fin.toISOString()).toBe('2030-01-15T20:30:00.000Z');
    expect(rango.literal).toBe('[2030-01-15T19:00:00.000Z,2030-01-15T20:30:00.000Z)');
  });

  it('rechaza construirTstzRange si horaFin <= horaInicio', () => {
    expect(capturar(() => construirTstzRange('2030-01-15', '20:00', '19:00')).getStatus()).toBe(
      400,
    );
  });

  it('esEstadoModificable sólo permite reservas Confirmada', () => {
    expect(esEstadoModificable(EstadoReserva.CONFIRMADA)).toBe(true);
    expect(esEstadoModificable(EstadoReserva.CANCELADA)).toBe(false);
    expect(esEstadoModificable(EstadoReserva.COMPLETADA)).toBe(false);
    expect(esEstadoModificable(EstadoReserva.NO_SHOW)).toBe(false);
  });
});
