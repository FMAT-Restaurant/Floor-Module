import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstadoReserva, type ReservaDto } from '@floor/shared';
import {
  esInicioReservaFuturo,
  esReservaConfirmadaFutura,
  getFechaLocalHoy,
  puedeRegistrarNoShow,
} from './reservas';

const reserva = {
  fecha: '2026-10-25',
  horaInicio: '14:00',
  estado: EstadoReserva.CONFIRMADA,
} as ReservaDto;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('FE-008 · Horario operativo del restaurante (RN-10, RN-11)', () => {
  it('obtiene el día del restaurante aunque en UTC ya sea el siguiente', () => {
    expect(getFechaLocalHoy(new Date('2026-10-26T03:00:00Z'))).toBe('2026-10-25');
  });

  it('conserva una reserva futura a las 14:00 de Mérida cuando son las 18:00 UTC', () => {
    const ahora = new Date('2026-10-25T18:00:00Z');
    expect(esInicioReservaFuturo(reserva.fecha, reserva.horaInicio, ahora)).toBe(true);
    expect(esReservaConfirmadaFutura(reserva, ahora)).toBe(true);
    expect(puedeRegistrarNoShow(reserva, ahora)).toBe(false);
  });

  it.each([
    ['2026-10-25T20:14:59Z', false],
    ['2026-10-25T20:15:00Z', false],
    ['2026-10-25T20:15:01Z', true],
  ])('evalúa la tolerancia de No-show en el instante %s', (instante, esperado) => {
    expect(puedeRegistrarNoShow(reserva, new Date(instante))).toBe(esperado);
  });

  it('aplica una tolerancia distinta y exige estado Confirmada', () => {
    const ahora = new Date('2026-10-25T20:20:00Z');
    expect(puedeRegistrarNoShow(reserva, ahora, 30)).toBe(false);
    expect(puedeRegistrarNoShow({ ...reserva, estado: EstadoReserva.CANCELADA }, ahora)).toBe(
      false,
    );
  });

  it('valida el inicio futuro con límite estricto y rechaza fechas inexistentes', () => {
    expect(
      esInicioReservaFuturo(reserva.fecha, reserva.horaInicio, new Date('2026-10-25T20:00:00Z')),
    ).toBe(false);
    expect(esInicioReservaFuturo('2026-02-30', '14:00', new Date('2026-01-01T00:00:00Z'))).toBe(
      false,
    );
    expect(esInicioReservaFuturo('2026-10-25', '25:00', new Date('2026-01-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('respeta la zona configurada y sus cambios de horario', async () => {
    vi.stubEnv('VITE_RESTAURANT_TIME_ZONE', 'America/New_York');
    vi.resetModules();
    const horarios = await import('./reservas');
    expect(
      horarios.esInicioReservaFuturo('2026-01-25', '12:00', new Date('2026-01-25T16:59:59Z')),
    ).toBe(true);
    expect(
      horarios.esInicioReservaFuturo('2026-01-25', '12:00', new Date('2026-01-25T17:00:00Z')),
    ).toBe(false);
    expect(
      horarios.esInicioReservaFuturo('2026-07-25', '12:00', new Date('2026-07-25T16:00:00Z')),
    ).toBe(false);
    expect(
      horarios.esInicioReservaFuturo('2026-03-08', '02:30', new Date('2026-03-01T00:00:00Z')),
    ).toBe(false);
  });
});
