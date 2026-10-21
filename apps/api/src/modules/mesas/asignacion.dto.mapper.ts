import type { AsignacionDto } from '@floor/shared';
import type { AsignacionRegistro } from './asignacion.registro';

export function aAsignacionDto(asignacion: AsignacionRegistro): AsignacionDto {
  return {
    asignacionId: asignacion.id,
    mesaId: asignacion.mesaId,
    meseroId: asignacion.meseroId,
    fechaHoraInicio: asignacion.fechaHoraInicio.toISOString(),
    fechaHoraFin: asignacion.fechaHoraFin ? asignacion.fechaHoraFin.toISOString() : null,
    activo: asignacion.activo,
  };
}
