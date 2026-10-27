import { EstadoEspera as EstadoEsperaPrisma } from '@prisma/client';
import { EstadoEspera } from '@floor/shared';

/**
 * Prisma no admite espacios en las llaves de un enum, así que `'En espera'` se llama
 * `En_espera` en el cliente Prisma. Este mapper centraliza la conversión entre ambos.
 */
const A_SHARED: Readonly<Record<EstadoEsperaPrisma, EstadoEspera>> = {
  [EstadoEsperaPrisma.En_espera]: EstadoEspera.EN_ESPERA,
  [EstadoEsperaPrisma.Notificado]: EstadoEspera.NOTIFICADO,
  [EstadoEsperaPrisma.Sentado]: EstadoEspera.SENTADO,
  [EstadoEsperaPrisma.Cancelado]: EstadoEspera.CANCELADO,
};

const A_PRISMA: Readonly<Record<EstadoEspera, EstadoEsperaPrisma>> = {
  [EstadoEspera.EN_ESPERA]: EstadoEsperaPrisma.En_espera,
  [EstadoEspera.NOTIFICADO]: EstadoEsperaPrisma.Notificado,
  [EstadoEspera.SENTADO]: EstadoEsperaPrisma.Sentado,
  [EstadoEspera.CANCELADO]: EstadoEsperaPrisma.Cancelado,
};

export function estadoEsperaDesdePrisma(estado: EstadoEsperaPrisma | string): EstadoEspera {
  if (estado in A_SHARED) {
    return A_SHARED[estado as EstadoEsperaPrisma];
  }
  return estado as EstadoEspera;
}

export function estadoEsperaAPrisma(estado: EstadoEspera): EstadoEsperaPrisma {
  return A_PRISMA[estado];
}
