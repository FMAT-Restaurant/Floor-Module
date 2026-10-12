/**
 * Helper to calculate formatted elapsed time for occupied tables.
 * Returns null if ocupadaDesde is not provided or invalid.
 * Examples: '32 min', '1h 15m', '2h'.
 */
export function formatTiempoOcupada(
  ocupadaDesde: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!ocupadaDesde) return null;
  const fecha = new Date(ocupadaDesde);
  if (Number.isNaN(fecha.getTime())) return null;

  const diffMs = Math.max(0, now.getTime() - fecha.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }

  const horas = Math.floor(diffMinutes / 60);
  const minutos = diffMinutes % 60;
  return minutos > 0 ? `${horas}h ${minutos}m` : `${horas}h`;
}

/**
 * Helper to format union badge text indicating all tables in the group.
 * Formats as 'Unidos: x, y y z', sorted in ascending numerical order.
 * Examples:
 * - [5, 6] -> 'Unidos: 5 y 6'
 * - [2, 5, 8] -> 'Unidos: 2, 5 y 8'
 * - [2] -> 'Unidos: 2'
 * - undefined or empty -> 'Unión activa'
 */
export function formatUnionTexto(mesasUnidas?: readonly number[]): string {
  if (!mesasUnidas || mesasUnidas.length === 0) {
    return 'Unión activa';
  }

  const sorted = [...mesasUnidas].sort((a, b) => a - b);

  if (sorted.length === 1) {
    return `Unidos: ${sorted[0]}`;
  }

  if (sorted.length === 2) {
    return `Unidos: ${sorted[0]} y ${sorted[1]}`;
  }

  const ultima = sorted[sorted.length - 1];
  const anteriores = sorted.slice(0, -1).join(', ');
  return `Unidos: ${anteriores} y ${ultima}`;
}
