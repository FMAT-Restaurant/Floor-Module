import type { EstadoReserva } from '@floor/shared';

export interface ReservaRegistro {
  id: string;
  mesaId: string;
  nombreContacto: string;
  telefonoContacto: string;
  cantidadPersonas: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: EstadoReserva;
  alertaEmitida: boolean;
}

export interface CrearReservaDatos {
  mesaId: string;
  nombreContacto: string;
  telefonoContacto: string;
  cantidadPersonas: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

export interface ActualizarReservaDatos {
  mesaId: string;
  cantidadPersonas: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado?: EstadoReserva;
}

export interface FiltroDisponibilidadDatos {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  personas: number;
}
