import { EstadoMesa, type MesaEnVivoDto } from '@floor/shared';

/**
 * RN-12: una unión requiere mesas activas, Libres, sin unión previa y de la misma zona.
 * Devuelve true si `mesa` puede sumarse a la selección actual.
 */
export function esMesaUnible(
  mesa: MesaEnVivoDto,
  seleccionadas: readonly MesaEnVivoDto[],
): boolean {
  if (!mesa.activo) return false;
  if (mesa.estadoFisico !== EstadoMesa.LIBRE) return false;
  if (mesa.unionId) return false;
  if (seleccionadas.length > 0 && mesa.zona !== seleccionadas[0].zona) return false;
  return true;
}

export function calcularAforoTotal(mesas: readonly MesaEnVivoDto[]): number {
  return mesas.reduce((total, mesa) => total + mesa.capacidad, 0);
}

export function formatListaMesas(numeros: readonly number[]): string {
  const ordenados = [...numeros].sort((a, b) => a - b).map(String);
  if (ordenados.length <= 1) return ordenados.join('');
  return `${ordenados.slice(0, -1).join(', ')} y ${ordenados[ordenados.length - 1]}`;
}
