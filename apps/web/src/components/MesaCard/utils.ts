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
 * Helper to format union badge text indicating joined tables.
 * Returns 'Unido con X', 'Unido con X y Y', or fallback 'Unión activa'.
 */
export function formatUnionTexto(mesasUnidas?: readonly number[]): string {
  if (!mesasUnidas || mesasUnidas.length === 0) {
    return 'Unión activa';
  }

  if (mesasUnidas.length === 1) {
    return `Unido con ${mesasUnidas[0]}`;
  }

  const ultimaMesa = mesasUnidas[mesasUnidas.length - 1];
  const anteriores = mesasUnidas.slice(0, -1).join(', ');
  return `Unido con ${anteriores} y ${ultimaMesa}`;
}
