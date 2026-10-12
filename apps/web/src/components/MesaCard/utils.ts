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
