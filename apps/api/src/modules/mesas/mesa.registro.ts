import type { EstadoMesa } from '@floor/shared';

/** Mesa tal como la usa el servicio: sin tipos de Prisma y con los enums de @floor/shared. */
export interface MesaRegistro {
  id: string;
  numeroMesa: number;
  capacidad: number;
  zona: string;
  estadoFisico: EstadoMesa;
  unionMesaId: string | null;
  activo: boolean;
  ocupadaDesde: Date | null;
  tieneReservaProxima?: boolean;
}

export interface MesaEnVivoRegistro extends MesaRegistro {
  /** Mesero con asignación activa, si lo hay. */
  meseroId: string | null;
}

export interface ReservaProximaRegistro {
  mesaId: string;
  inicio: Date;
}

export interface ReservaProximaConflicto {
  reservaId: string;
  nombreContacto: string;
  horaInicio: string;
  cantidadPersonas: number;
}
