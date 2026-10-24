import { EstadoReserva as EstadoReservaPrisma } from '@prisma/client';
import { EstadoReserva } from '@floor/shared';
import { estadoReservaAPrisma, estadoReservaDesdePrisma } from './estado-reserva.mapper';

describe('estado-reserva.mapper', () => {
  it.each([
    [EstadoReservaPrisma.Confirmada, EstadoReserva.CONFIRMADA],
    [EstadoReservaPrisma.Cancelada, EstadoReserva.CANCELADA],
    [EstadoReservaPrisma.Completada, EstadoReserva.COMPLETADA],
    [EstadoReservaPrisma.No_show, EstadoReserva.NO_SHOW],
  ])('convierte %s ↔ %s', (prismaVal, sharedVal) => {
    expect(estadoReservaDesdePrisma(prismaVal)).toBe(sharedVal);
    expect(estadoReservaAPrisma(sharedVal)).toBe(prismaVal);
  });
});
