export const queryKeys = {
  mesas: {
    all: ['mesas'] as const,
    enVivo: () => [...queryKeys.mesas.all, 'en-vivo'] as const,
    detail: (mesaId: string) => [...queryKeys.mesas.all, 'detail', mesaId] as const,
    asignaciones: () => [...queryKeys.mesas.all, 'asignaciones'] as const,
  },
  reservas: {
    all: ['reservas'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.reservas.all, 'list', filters] as const,
    disponibilidad: (params?: Record<string, unknown>) =>
      [...queryKeys.reservas.all, 'disponibilidad', params] as const,
  },
  espera: {
    all: ['espera'] as const,
    list: (estado?: string) => [...queryKeys.espera.all, 'list', estado] as const,
  },
  uniones: {
    all: ['uniones'] as const,
    list: (estado?: string) => [...queryKeys.uniones.all, 'list', estado] as const,
  },
};
