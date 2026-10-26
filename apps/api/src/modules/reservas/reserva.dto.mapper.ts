import { EstadoReserva, type CrearReservaResponseDto, type ReservaDto } from '@floor/shared';
import type { ReservaRegistro } from './reserva.registro';

export function aReservaDto(reserva: ReservaRegistro): ReservaDto {
  return {
    reservaId: reserva.id,
    mesaId: reserva.mesaId,
    nombreContacto: reserva.nombreContacto,
    telefonoContacto: reserva.telefonoContacto,
    cantidadPersonas: reserva.cantidadPersonas,
    fecha: reserva.fecha,
    horaInicio: reserva.horaInicio,
    horaFin: reserva.horaFin,
    estado: reserva.estado,
  };
}

export function aCrearReservaResponseDto(reserva: ReservaRegistro): CrearReservaResponseDto {
  return {
    reservaId: reserva.id,
    mesaId: reserva.mesaId,
    estado: EstadoReserva.CONFIRMADA,
  };
}
