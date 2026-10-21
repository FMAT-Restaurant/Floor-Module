/** Asignación de mesero tal como la consume el servicio de dominio (SPEC §2.3). */
export interface AsignacionRegistro {
  id: string;
  mesaId: string;
  meseroId: string;
  fechaHoraInicio: Date;
  fechaHoraFin: Date | null;
  activo: boolean;
}

export interface CrearAsignacionDatos {
  mesaId: string;
  meseroId: string;
  fechaHoraInicio: Date;
}

export interface FiltroAsignaciones {
  meseroId?: string;
  activo?: boolean;
}
