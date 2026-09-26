import { EstadoMesa, EstadoReserva, EstadoEspera, EstadoUnion } from '../enums';

export interface Mesa {
  id_mesa: number | string;
  numero_mesa: number;
  capacidad: number;
  zona: string;
  estado_fisico: EstadoMesa;
  id_union_mesa?: string | null;
  tiene_reserva_proxima?: boolean;
}

export interface Reserva {
  id_reserva: string;
  id_mesa: number | string;
  nombre_contacto: string;
  telefono_contacto: string;
  fecha_reserva: string; // YYYY-MM-DD
  hora_inicio: string;   // HH:mm
  hora_fin: string;      // HH:mm
  estado: EstadoReserva;
}

export interface AsignacionMesero {
  id_asignacion: string;
  id_mesa: number | string;
  id_mesero: string; // Auth external ID
  fecha_hora_inicio: string;
  fecha_hora_fin?: string | null;
  activo: boolean;
}

export interface ListaEspera {
  id_espera: string;
  nombre_cliente: string;
  telefono_contacto: string;
  cantidad_personas: number;
  hora_llegada: string;
  estado: EstadoEspera;
  id_mesa_asignada?: number | string | null;
}

export interface UnionMesa {
  id_union: string;
  mesas_ids: Array<number | string>;
  fecha_creacion: string;
  fecha_disolucion?: string | null;
  estado: EstadoUnion;
}
