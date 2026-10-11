import { EstadoMesa } from '../enums';
import type {
  DiningSessionIniciadaPayload,
  MesaEstadoActualizadoPayload,
  ReservaProximaAlertaPayload,
} from '../events';
import { FIXTURE_MESA_IDS } from './mesas';
import { FIXTURE_RESERVA_IDS } from './reservas';

export interface EsperaMesaDisponiblePayload {
  mesaId: string;
  esperaId: string;
  cliente: {
    nombre: string;
    cantidadPersonas: number;
  };
}

export const fixtureMesaEstadoActualizadoPayload: MesaEstadoActualizadoPayload = {
  mesaId: FIXTURE_MESA_IDS.MESA_1,
  estado: EstadoMesa.OCUPADA,
  unionId: null,
  timestamp: '2026-10-11T13:45:00.000Z',
};

export const fixtureReservaProximaAlertaPayload: ReservaProximaAlertaPayload = {
  reservaId: FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA,
  mesaId: FIXTURE_MESA_IDS.MESA_2,
  nombreContacto: 'Laura Pérez',
  horaInicio: '14:00',
  minutosRestantes: 15,
  timestamp: '2026-10-11T13:45:00.000Z',
};

export const fixtureEsperaMesaDisponiblePayload: EsperaMesaDisponiblePayload = {
  mesaId: FIXTURE_MESA_IDS.MESA_1,
  esperaId: 'e1000000-0000-4000-8000-000000000001',
  cliente: {
    nombre: 'Gabriel Torres',
    cantidadPersonas: 2,
  },
};

export const fixtureDiningSessionIniciadaPayload: DiningSessionIniciadaPayload = {
  sessionId: '550e8400-e29b-41d4-a716-446655440099',
  mesaId: FIXTURE_MESA_IDS.MESA_1,
  unionId: null,
  meseroId: 'd1000000-0000-4000-8000-000000000001',
  comensales: 2,
  timestamp: '2026-10-11T13:45:00.000Z',
};
