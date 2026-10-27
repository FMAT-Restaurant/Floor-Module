import type { EstadoMesa, EstadoUnion } from '@floor/shared';

/** Mesa candidata a unirse, leída con bloqueo de fila (`FOR UPDATE`). */
export interface MesaCandidataRegistro {
  id: string;
  numeroMesa: number;
  capacidad: number;
  zona: string;
  estadoFisico: EstadoMesa;
  unionMesaId: string | null;
  activo: boolean;
}

/** Unión tal como la usa el servicio: sin tipos de Prisma y con los enums de @floor/shared. */
export interface UnionRegistro {
  id: string;
  zona: string;
  estado: EstadoUnion;
  fechaCreacion: Date;
  fechaDisolucion: Date | null;
  mesasIds: string[];
}

/** Reserva Confirmada que dispara RN-05 en alguna de las mesas a unir. */
export interface ReservaProximaEnUnion {
  mesaId: string;
  reservaId: string;
  nombreContacto: string;
  horaInicio: string;
  cantidadPersonas: number;
}
