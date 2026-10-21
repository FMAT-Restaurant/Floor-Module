import type { MesaDto } from '@floor/shared';
import type { MesaRegistro } from './mesa.registro';

export function aMesaDto(mesa: MesaRegistro): MesaDto {
  return {
    mesaId: mesa.id,
    numeroMesa: mesa.numeroMesa,
    capacidad: mesa.capacidad,
    zona: mesa.zona,
    estadoFisico: mesa.estadoFisico,
    unionId: mesa.unionMesaId,
    activo: mesa.activo,
  };
}
