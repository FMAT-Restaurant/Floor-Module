import { EstadoEspera } from '@floor/shared';
import type { EsperaRegistro } from '../espera.registro';

/**
 * SPEC §5.6: cuando no se especifica `estado` en GET /sala/espera, se listan los registros
 * activos (`En espera` y `Notificado`).
 */
export const ESTADOS_ACTIVOS_ESPERA: readonly EstadoEspera[] = [
  EstadoEspera.EN_ESPERA,
  EstadoEspera.NOTIFICADO,
];

/**
 * Máquina de estados de la lista de espera para cambios manuales vía
 * PATCH /sala/espera/{esperaId}/estado (SPEC §4.3, §5.6, RF-022).
 */
const TRANSICIONES_MANUALES_ESPERA: Readonly<Record<EstadoEspera, readonly EstadoEspera[]>> = {
  [EstadoEspera.EN_ESPERA]: [EstadoEspera.SENTADO, EstadoEspera.CANCELADO],
  [EstadoEspera.NOTIFICADO]: [EstadoEspera.SENTADO, EstadoEspera.CANCELADO, EstadoEspera.EN_ESPERA],
  [EstadoEspera.SENTADO]: [],
  [EstadoEspera.CANCELADO]: [],
};

/** Estados a los que puede transicionar manualmente una entrada desde `desde`. */
export function transicionesManualesEsperaDesde(desde: EstadoEspera): readonly EstadoEspera[] {
  return TRANSICIONES_MANUALES_ESPERA[desde];
}

export function esTransicionEsperaPermitida(desde: EstadoEspera, hacia: EstadoEspera): boolean {
  return TRANSICIONES_MANUALES_ESPERA[desde].includes(hacia);
}

/**
 * Al volver a `En espera` (mesa ocupada por otro, SPEC §4.3) o pasar a `Cancelado`,
 * se limpia la mesa asignada; al pasar a `Sentado` se preserva la asignación previa.
 */
export function resolverMesaAsignadaEnTransicion(
  hacia: EstadoEspera,
  mesaAsignadaActual: string | null,
): string | null {
  if (hacia === EstadoEspera.EN_ESPERA || hacia === EstadoEspera.CANCELADO) {
    return null;
  }
  return mesaAsignadaActual;
}

/**
 * Resuelve los estados a filtrar en la consulta de lista de espera (SPEC §5.6).
 */
export function resolverEstadosFiltroEspera(estado?: EstadoEspera): readonly EstadoEspera[] {
  return estado ? [estado] : ESTADOS_ACTIVOS_ESPERA;
}

/**
 * Ordena entradas de la cola en estricto orden FIFO (`horaLlegada` ASC, desempatando por `id` ASC).
 */
export function ordenarColaFifo<T extends { id: string; horaLlegada: Date }>(
  registros: readonly T[],
): T[] {
  return [...registros].sort((a, b) => {
    const diff = a.horaLlegada.getTime() - b.horaLlegada.getTime();
    if (diff !== 0) {
      return diff;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Filtra la cola por estado (por defecto `En espera` y `Notificado`) y la ordena en FIFO (`horaLlegada` ASC).
 */
export function filtrarYOrdenarColaEspera(
  registros: readonly EsperaRegistro[],
  estado?: EstadoEspera,
): EsperaRegistro[] {
  const estadosPermitidos = new Set(resolverEstadosFiltroEspera(estado));
  const filtrados = registros.filter((r) => estadosPermitidos.has(r.estado));
  return ordenarColaFifo(filtrados);
}

/**
 * RN-17 · RF-020 · F4: busca en orden FIFO (`horaLlegada` ASC) el cliente más antiguo
 * en estado `En espera` cuya `cantidadPersonas <= capacidadMesa`.
 */
export function seleccionarSiguienteCompatibleFifo(
  registros: readonly EsperaRegistro[],
  capacidadMesa: number,
): EsperaRegistro | null {
  if (capacidadMesa < 1) {
    return null;
  }
  const compatibles = registros.filter(
    (r) =>
      r.estado === EstadoEspera.EN_ESPERA &&
      r.cantidadPersonas >= 1 &&
      r.cantidadPersonas <= capacidadMesa,
  );
  if (compatibles.length === 0) {
    return null;
  }
  return ordenarColaFifo(compatibles)[0];
}
