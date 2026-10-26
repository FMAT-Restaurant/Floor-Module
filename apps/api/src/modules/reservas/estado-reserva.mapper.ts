import { EstadoReserva as EstadoReservaPrisma } from '@prisma/client';
import { EstadoReserva } from '@floor/shared';

/**
 * Prisma no admite guiones en las llaves de un enum, así que `No-show` se llama
 * `No_show` en el cliente Prisma. Este mapper centraliza la conversión entre ambos.
 */
const A_SHARED: Readonly<Record<EstadoReservaPrisma, EstadoReserva>> = {
  [EstadoReservaPrisma.Confirmada]: EstadoReserva.CONFIRMADA,
  [EstadoReservaPrisma.Cancelada]: EstadoReserva.CANCELADA,
  [EstadoReservaPrisma.Completada]: EstadoReserva.COMPLETADA,
  [EstadoReservaPrisma.No_show]: EstadoReserva.NO_SHOW,
};

const A_PRISMA: Readonly<Record<EstadoReserva, EstadoReservaPrisma>> = {
  [EstadoReserva.CONFIRMADA]: EstadoReservaPrisma.Confirmada,
  [EstadoReserva.CANCELADA]: EstadoReservaPrisma.Cancelada,
  [EstadoReserva.COMPLETADA]: EstadoReservaPrisma.Completada,
  [EstadoReserva.NO_SHOW]: EstadoReservaPrisma.No_show,
};

export function estadoReservaDesdePrisma(estado: EstadoReservaPrisma): EstadoReserva {
  return A_SHARED[estado];
}

export function estadoReservaAPrisma(estado: EstadoReserva): EstadoReservaPrisma {
  return A_PRISMA[estado];
}
