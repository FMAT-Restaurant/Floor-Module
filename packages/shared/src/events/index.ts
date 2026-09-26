import { EstadoMesa } from '../enums';

export const EVENT_TOPICS = {
  DINING_SESSION_INICIADA: 'sala.dining_session.iniciada',
  MESA_ESTADO_ACTUALIZADO: 'sala.mesa.estado_actualizado',
  RESERVA_PROXIMA_ALERTA: 'sala.reserva.proxima_alerta',
} as const;

export interface DiningSessionIniciadaPayload {
  sessionId: string;
  mesaId?: number | string;
  unionId?: string | null;
  mesasIds?: Array<number | string>;
  meseroId: string;
  comensales: number;
  timestamp: string;
}

export interface MesaEstadoActualizadoPayload {
  mesaId?: number | string;
  mesasIds?: Array<number | string>;
  estado: EstadoMesa;
  unionId?: string | null;
  timestamp: string;
}

export interface ReservaProximaAlertaPayload {
  reservaId: string;
  mesaId: number | string;
  nombreContacto: string;
  horaInicio: string;
  minutosRestantes: number;
  timestamp: string;
}
