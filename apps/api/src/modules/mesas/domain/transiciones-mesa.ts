import { EstadoMesa } from '@floor/shared';

/**
 * Máquina de estados de la mesa para cambios MANUALES vía PATCH /sala/mesas/{mesaId}/estado
 * (SPEC §4.1, RN-04, RN-06, RN-07).
 *
 * `Libre → Ocupada` no figura aquí: sólo ocurre por POST /ocupar o por una unión (RN-04).
 */
const TRANSICIONES_MANUALES: Readonly<Record<EstadoMesa, readonly EstadoMesa[]>> = {
  [EstadoMesa.LIBRE]: [],
  [EstadoMesa.OCUPADA]: [EstadoMesa.LIMPIEZA_PENDIENTE], // RN-06
  [EstadoMesa.LIMPIEZA_PENDIENTE]: [EstadoMesa.LIBRE], // RN-07
};

/** Estados a los que se puede pasar manualmente desde `desde`. */
export function transicionesManualesDesde(desde: EstadoMesa): readonly EstadoMesa[] {
  return TRANSICIONES_MANUALES[desde];
}

export function esTransicionManualPermitida(desde: EstadoMesa, hacia: EstadoMesa): boolean {
  return TRANSICIONES_MANUALES[desde].includes(hacia);
}
