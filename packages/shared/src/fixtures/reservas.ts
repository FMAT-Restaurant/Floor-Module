import { EstadoReserva } from '../enums/index.js';
import type { ReservaDto } from '../schemas/index.js';
import { FIXTURE_MESA_IDS } from './mesas.js';

export const FIXTURE_RESERVA_IDS = {
  RESERVA_1_PROXIMA: 'b1000000-0000-4000-8000-000000000001',
  RESERVA_2_FUTURA: 'b1000000-0000-4000-8000-000000000002',
  RESERVA_3_COMPLETADA: 'b1000000-0000-4000-8000-000000000003',
  RESERVA_4_CANCELADA: 'b1000000-0000-4000-8000-000000000004',
  RESERVA_5_NO_SHOW: 'b1000000-0000-4000-8000-000000000005',
} as const;

export const fixtureReservas: ReservaDto[] = [
  {
    reservaId: FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA,
    mesaId: FIXTURE_MESA_IDS.MESA_2,
    nombreContacto: 'Laura Pérez',
    telefonoContacto: '+52 999 123 4567',
    cantidadPersonas: 4,
    fecha: '2026-10-11',
    horaInicio: '14:00',
    horaFin: '15:30',
    estado: EstadoReserva.CONFIRMADA,
  },
  {
    reservaId: FIXTURE_RESERVA_IDS.RESERVA_2_FUTURA,
    mesaId: FIXTURE_MESA_IDS.MESA_1,
    nombreContacto: 'Mauricio Díaz',
    telefonoContacto: '+52 999 765 4321',
    cantidadPersonas: 2,
    fecha: '2026-10-11',
    horaInicio: '20:00',
    horaFin: '21:30',
    estado: EstadoReserva.CONFIRMADA,
  },
  {
    reservaId: FIXTURE_RESERVA_IDS.RESERVA_3_COMPLETADA,
    mesaId: FIXTURE_MESA_IDS.MESA_3,
    nombreContacto: 'Sofía Romero',
    telefonoContacto: '+52 999 888 9999',
    cantidadPersonas: 4,
    fecha: '2026-10-11',
    horaInicio: '12:30',
    horaFin: '14:00',
    estado: EstadoReserva.COMPLETADA,
  },
  {
    reservaId: FIXTURE_RESERVA_IDS.RESERVA_4_CANCELADA,
    mesaId: FIXTURE_MESA_IDS.MESA_4,
    nombreContacto: 'Jorge Morales',
    telefonoContacto: '+52 999 333 2211',
    cantidadPersonas: 6,
    fecha: '2026-10-11',
    horaInicio: '16:00',
    horaFin: '17:30',
    estado: EstadoReserva.CANCELADA,
  },
  {
    reservaId: FIXTURE_RESERVA_IDS.RESERVA_5_NO_SHOW,
    mesaId: FIXTURE_MESA_IDS.MESA_7,
    nombreContacto: 'Elena Castillo',
    telefonoContacto: '+52 999 555 4433',
    cantidadPersonas: 2,
    fecha: '2026-10-11',
    horaInicio: '11:00',
    horaFin: '12:30',
    estado: EstadoReserva.NO_SHOW,
  },
];
