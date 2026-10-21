import { EstadoMesa as EstadoMesaPrisma } from '@prisma/client';
import { EstadoMesa } from '@floor/shared';

/**
 * Prisma no admite espacios en las llaves de un enum, así que `Limpieza pendiente` se llama
 * `Limpieza_pendiente` en el cliente. Este mapper es el único punto de conversión entre ambos.
 */
const A_SHARED: Readonly<Record<EstadoMesaPrisma, EstadoMesa>> = {
  [EstadoMesaPrisma.Libre]: EstadoMesa.LIBRE,
  [EstadoMesaPrisma.Ocupada]: EstadoMesa.OCUPADA,
  [EstadoMesaPrisma.Limpieza_pendiente]: EstadoMesa.LIMPIEZA_PENDIENTE,
};

const A_PRISMA: Readonly<Record<EstadoMesa, EstadoMesaPrisma>> = {
  [EstadoMesa.LIBRE]: EstadoMesaPrisma.Libre,
  [EstadoMesa.OCUPADA]: EstadoMesaPrisma.Ocupada,
  [EstadoMesa.LIMPIEZA_PENDIENTE]: EstadoMesaPrisma.Limpieza_pendiente,
};

export function estadoMesaDesdePrisma(estado: EstadoMesaPrisma): EstadoMesa {
  return A_SHARED[estado];
}

export function estadoMesaAPrisma(estado: EstadoMesa): EstadoMesaPrisma {
  return A_PRISMA[estado];
}
