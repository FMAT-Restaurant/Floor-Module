import { EstadoMesa } from '@floor/shared';
import type { MesaCandidataRegistro } from '../union.registro';
import {
  mesasNoDisponiblesParaUnion,
  mesasNoEncontradasEnUnion,
  unionInvalida,
  zonaIncompatible,
} from '../uniones.errores';

export interface UnionValidada {
  zona: string;
  capacidadTotal: number;
}

/** SPEC §8: arreglo de ≥ 2 UUIDs sin duplicados. */
export function validarSeleccionUnion(mesasIds: readonly string[]): void {
  if (mesasIds.length < 2) {
    throw unionInvalida('Se requieren al menos 2 mesas para crear una unión', {
      mesasIds: [...mesasIds],
    });
  }
  if (new Set(mesasIds).size !== mesasIds.length) {
    throw unionInvalida('mesasIds no debe contener identificadores duplicados', {
      mesasIds: [...mesasIds],
    });
  }
}

/**
 * RN-12 · ADR-009: valida que todas las mesas solicitadas existan y estén activas (404),
 * compartan zona (409 ZONA_INCOMPATIBLE) y estén Libres sin unión previa (409 MESA_NO_DISPONIBLE).
 * La zona se valida antes que el estado: es un error estructural de la selección.
 */
export function validarMesasParaUnion(
  mesasIds: readonly string[],
  mesas: readonly MesaCandidataRegistro[],
): UnionValidada {
  const porId = new Map(mesas.map((mesa) => [mesa.id, mesa]));
  const faltantes = mesasIds.filter((id) => !porId.get(id)?.activo);
  if (faltantes.length > 0) throw mesasNoEncontradasEnUnion(faltantes);

  const seleccion = mesasIds.map((id) => porId.get(id) as MesaCandidataRegistro);

  const zonas = new Set(seleccion.map((mesa) => mesa.zona));
  if (zonas.size > 1) {
    throw zonaIncompatible(Object.fromEntries(seleccion.map((mesa) => [mesa.id, mesa.zona])));
  }

  const noDisponibles = seleccion.filter(
    (mesa) => mesa.estadoFisico !== EstadoMesa.LIBRE || mesa.unionMesaId !== null,
  );
  if (noDisponibles.length > 0) {
    throw mesasNoDisponiblesParaUnion(
      noDisponibles.map((mesa) => ({
        mesaId: mesa.id,
        estadoFisico: mesa.estadoFisico,
        unionId: mesa.unionMesaId,
      })),
    );
  }

  return {
    zona: seleccion[0].zona,
    capacidadTotal: seleccion.reduce((total, mesa) => total + mesa.capacidad, 0),
  };
}
