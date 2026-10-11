import {
  EstadoMesa,
  fixtureEsperaMesaDisponiblePayload,
  fixtureMesaEstadoActualizadoPayload,
  fixtureReservaProximaAlertaPayload,
  type EsperaMesaDisponiblePayload,
  type MesaEstadoActualizadoPayload,
  type ReservaProximaAlertaPayload,
} from '@floor/shared';
import { mockDb, type MockDatabase } from './db';

type MesaListener = (payload: MesaEstadoActualizadoPayload) => void;
type ReservaListener = (payload: ReservaProximaAlertaPayload) => void;
type EsperaListener = (payload: EsperaMesaDisponiblePayload) => void;
type WsBroadcastFn = (event: string, payload: unknown) => void;

class SalaSimulationService {
  private mesaListeners = new Set<MesaListener>();
  private reservaListeners = new Set<ReservaListener>();
  private esperaListeners = new Set<EsperaListener>();
  private wsBroadcaster: WsBroadcastFn | null = null;

  setWsBroadcaster(broadcaster: WsBroadcastFn | null) {
    this.wsBroadcaster = broadcaster;
  }

  // --- Subscriptions ---
  onMesaEstadoActualizado(listener: MesaListener): () => void {
    this.mesaListeners.add(listener);
    return () => this.mesaListeners.delete(listener);
  }

  onReservaProximaAlerta(listener: ReservaListener): () => void {
    this.reservaListeners.add(listener);
    return () => this.reservaListeners.delete(listener);
  }

  onEsperaMesaDisponible(listener: EsperaListener): () => void {
    this.esperaListeners.add(listener);
    return () => this.esperaListeners.delete(listener);
  }

  // --- Emission ---
  emitMesaEstadoActualizado(payload: MesaEstadoActualizadoPayload) {
    this.mesaListeners.forEach((l) => l(payload));
    if (this.wsBroadcaster) {
      this.wsBroadcaster('mesa.estado_actualizado', payload);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('floor:mesa.estado_actualizado', { detail: payload }));
    }
  }

  emitReservaProximaAlerta(payload: ReservaProximaAlertaPayload) {
    this.reservaListeners.forEach((l) => l(payload));
    if (this.wsBroadcaster) {
      this.wsBroadcaster('reserva.proxima_alerta', payload);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('floor:reserva.proxima_alerta', { detail: payload }));
    }
  }

  emitEsperaMesaDisponible(payload: EsperaMesaDisponiblePayload) {
    this.esperaListeners.forEach((l) => l(payload));
    if (this.wsBroadcaster) {
      this.wsBroadcaster('espera.mesa_disponible', payload);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('floor:espera.mesa_disponible', { detail: payload }));
    }
  }

  // --- Browser simulation triggers ---
  simulateMesaEstadoTransition(
    mesaId: string,
    nuevoEstado: EstadoMesa,
  ): MesaEstadoActualizadoPayload {
    const prev = mockDb.getMesa(mesaId);
    const result = mockDb.actualizarEstadoMesa(mesaId, nuevoEstado);

    const payload: MesaEstadoActualizadoPayload = {
      mesaId,
      estado: result.estado,
      unionId: prev.unionId,
      timestamp: new Date().toISOString(),
    };
    this.emitMesaEstadoActualizado(payload);

    if (result.waitlistMatch) {
      this.emitEsperaMesaDisponible({
        mesaId,
        esperaId: result.waitlistMatch.esperaId,
        cliente: result.waitlistMatch.cliente,
      });
    }

    return payload;
  }

  simulateUpcomingReservationAlert(reservaId?: string): ReservaProximaAlertaPayload {
    const reservas = mockDb.getReservas();
    const target = reservaId
      ? reservas.find((r) => r.reservaId === reservaId)
      : (reservas.find((r) => r.estado === 'Confirmada') ?? reservas[0]);

    const payload: ReservaProximaAlertaPayload = target
      ? {
          reservaId: target.reservaId,
          mesaId: target.mesaId,
          nombreContacto: target.nombreContacto,
          horaInicio: target.horaInicio,
          minutosRestantes: 20,
          timestamp: new Date().toISOString(),
        }
      : fixtureReservaProximaAlertaPayload;

    this.emitReservaProximaAlerta(payload);
    return payload;
  }

  simulateWaitingTableAlert(mesaId?: string, esperaId?: string): EsperaMesaDisponiblePayload {
    const mesas = mockDb.getMesas({ estado: EstadoMesa.LIBRE });
    const targetMesaId = mesaId ?? (mesas[0]?.mesaId || fixtureMesaEstadoActualizadoPayload.mesaId);
    const espera = mockDb.getEspera();
    const targetEspera = esperaId ? espera.find((e) => e.esperaId === esperaId) : espera[0];

    const payload: EsperaMesaDisponiblePayload = {
      mesaId: targetMesaId as string,
      esperaId: targetEspera?.esperaId ?? fixtureEsperaMesaDisponiblePayload.esperaId,
      cliente: targetEspera
        ? {
            nombre: targetEspera.nombreCliente,
            cantidadPersonas: targetEspera.cantidadPersonas,
          }
        : fixtureEsperaMesaDisponiblePayload.cliente,
    };

    this.emitEsperaMesaDisponible(payload);
    return payload;
  }

  resetDb() {
    mockDb.reset();
  }

  getDb(): ReturnType<MockDatabase['getState']> {
    return mockDb.getState();
  }
}

export const mockSalaSimulation = new SalaSimulationService();

export interface FloorMockGlobalApi {
  db: MockDatabase;
  simulation: SalaSimulationService;
  simulateTableState: (mesaId: string, state: EstadoMesa) => MesaEstadoActualizadoPayload;
  simulateUpcomingReservationAlert: (reservaId?: string) => ReservaProximaAlertaPayload;
  simulateWaitingTableAlert: (mesaId?: string, esperaId?: string) => EsperaMesaDisponiblePayload;
  resetDatabase: () => void;
  getDbState: () => ReturnType<MockDatabase['getState']>;
}

declare global {
  interface Window {
    __FLOOR_MOCK__?: FloorMockGlobalApi;
  }
}

export function registerWindowMockApi() {
  if (typeof window !== 'undefined') {
    window.__FLOOR_MOCK__ = {
      db: mockDb,
      simulation: mockSalaSimulation,
      simulateTableState: (mesaId, state) =>
        mockSalaSimulation.simulateMesaEstadoTransition(mesaId, state),
      simulateUpcomingReservationAlert: (reservaId) =>
        mockSalaSimulation.simulateUpcomingReservationAlert(reservaId),
      simulateWaitingTableAlert: (mesaId, esperaId) =>
        mockSalaSimulation.simulateWaitingTableAlert(mesaId, esperaId),
      resetDatabase: () => mockSalaSimulation.resetDb(),
      getDbState: () => mockSalaSimulation.getDb(),
    };
  }
}
