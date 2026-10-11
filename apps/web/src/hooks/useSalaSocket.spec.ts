import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { EstadoMesa } from '@floor/shared';
import { queryKeys } from '../api/queryKeys';
import { SalaSocketProvider, useSalaSocket, getSalaSocketUrl, getAuthToken } from './useSalaSocket';

interface ListenerMap {
  [event: string]: Set<(...args: unknown[]) => void>;
}

class MockSocket {
  public connected = false;
  private listeners: ListenerMap = {};
  public io = {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      this.on(`io:${event}`, cb);
      return this.io;
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      this.off(`io:${event}`, cb);
      return this.io;
    }),
  };

  on = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(callback);
    return this;
  });

  off = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
    this.listeners[event]?.delete(callback);
    return this;
  });

  emit = vi.fn((event: string, ...args: unknown[]) => {
    const set = this.listeners[event];
    if (set) {
      set.forEach((cb) => cb(...args));
    }
    return true;
  });

  disconnect = vi.fn(() => {
    this.connected = false;
    this.emit('disconnect', 'io client disconnect');
    return this;
  });

  connect = vi.fn(() => {
    this.connected = true;
    this.emit('connect');
    return this;
  });

  resetListeners() {
    this.listeners = {};
    this.connected = false;
    vi.clearAllMocks();
  }
}

const mockSocketInstance = new MockSocket();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocketInstance),
}));

describe('useSalaSocket & SalaSocketProvider', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mockSocketInstance.resetListeners();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.spyOn(queryClient, 'invalidateQueries');
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWrapper(socket?: unknown) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          SalaSocketProvider,
          { socket: (socket as unknown as Socket) || undefined, queryClient },
          children,
        ),
      );
    };
  }

  describe('1. Conexión e inicialización', () => {
    it('se conecta al namespace /sala con los parámetros y opciones requeridas', () => {
      sessionStorage.setItem('auth_token', 'jwt-test-token');

      renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      expect(io).toHaveBeenCalledWith(
        expect.stringMatching(/\/sala$/),
        expect.objectContaining({
          auth: { token: 'Bearer jwt-test-token' },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          autoConnect: true,
        }),
      );
    });

    it('construye la URL de websocket correctamente con getSalaSocketUrl', () => {
      expect(getSalaSocketUrl('http://localhost:3000')).toBe('http://localhost:3000/sala');
      expect(getSalaSocketUrl('http://localhost:3000/sala')).toBe('http://localhost:3000/sala');
      expect(getSalaSocketUrl('http://localhost:3000/')).toBe('http://localhost:3000/sala');
    });

    it('obtiene el token formateado con Bearer mediante getAuthToken', () => {
      expect(getAuthToken()).toBeNull();
      sessionStorage.setItem('auth_token', 'my-secret');
      expect(getAuthToken()).toBe('Bearer my-secret');
      sessionStorage.setItem('auth_token', 'Bearer already-prefixed');
      expect(getAuthToken()).toBe('Bearer already-prefixed');
    });

    it('expone el estado inicial de conexión y el socket', () => {
      const { result } = renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.socket).toBe(mockSocketInstance);
      expect(result.current.lastEvent).toBeNull();
    });
  });

  describe('2. Invalidación ante mesa.estado_actualizado', () => {
    it('invalida queryKeys.mesas.enVivo y detail ante evento de cambio de estado', () => {
      renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('mesa.estado_actualizado', {
          mesaId: 'mesa-101',
          estado: EstadoMesa.OCUPADA,
          unionId: null,
          timestamp: '2026-10-11T12:00:00.000Z',
        });
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.enVivo(),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.detail('mesa-101'),
      });
    });

    it('invalida queryKeys.uniones.all si la mesa tiene unión activa', () => {
      renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('mesa.estado_actualizado', {
          mesaId: 'mesa-102',
          estado: EstadoMesa.OCUPADA,
          unionId: 'union-456',
          timestamp: '2026-10-11T12:00:00.000Z',
        });
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.uniones.all,
      });
    });

    it('invalida detalles para todas las mesas si mesasIds está presente en el payload', () => {
      renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('mesa.estado_actualizado', {
          mesasIds: ['mesa-1', 'mesa-2'],
          estado: EstadoMesa.OCUPADA,
          unionId: 'union-789',
          timestamp: '2026-10-11T12:00:00.000Z',
        });
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.detail('mesa-1'),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.detail('mesa-2'),
      });
    });

    it('ejecuta callback personalizado registrado por el consumidor', () => {
      const onMesaMock = vi.fn();
      renderHook(() => useSalaSocket({ onMesaEstadoActualizado: onMesaMock }), {
        wrapper: createWrapper(),
      });

      const payload = {
        mesaId: 'mesa-103',
        estado: EstadoMesa.LIMPIEZA_PENDIENTE,
        timestamp: '2026-10-11T12:05:00.000Z',
      };

      act(() => {
        mockSocketInstance.emit('mesa.estado_actualizado', payload);
      });

      expect(onMesaMock).toHaveBeenCalledWith(payload);
    });

    it('actualiza lastEvent en el hook tras procesar el evento', () => {
      const { result } = renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('mesa.estado_actualizado', {
          mesaId: 'mesa-1',
          estado: EstadoMesa.LIBRE,
          timestamp: '2026-10-11T12:00:00.000Z',
        });
      });

      expect(result.current.lastEvent?.name).toBe('mesa.estado_actualizado');
      expect(result.current.lastEvent?.timestamp).toBeGreaterThan(0);
    });
  });

  describe('3. Invalidación ante reserva.proxima_alerta', () => {
    it('invalida queryKeys.reservas.all y queryKeys.mesas.enVivo', () => {
      renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('reserva.proxima_alerta', {
          reservaId: 'res-001',
          mesaId: 'mesa-105',
          nombreContacto: 'Carlos Rossi',
          horaInicio: '14:00',
          minutosRestantes: 15,
          timestamp: '2026-10-11T13:45:00.000Z',
        });
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.reservas.all,
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.enVivo(),
      });
    });

    it('ejecuta callback del suscriptor ante reserva.proxima_alerta', () => {
      const onReservaMock = vi.fn();
      renderHook(() => useSalaSocket({ onReservaProximaAlerta: onReservaMock }), {
        wrapper: createWrapper(),
      });

      const payload = {
        reservaId: 'res-002',
        mesaId: 'mesa-106',
        nombreContacto: 'Ana Gómez',
        horaInicio: '15:00',
        minutosRestantes: 20,
        timestamp: '2026-10-11T14:40:00.000Z',
      };

      act(() => {
        mockSocketInstance.emit('reserva.proxima_alerta', payload);
      });

      expect(onReservaMock).toHaveBeenCalledWith(payload);
    });
  });

  describe('4. Invalidación ante espera.mesa_disponible', () => {
    it('invalida queryKeys.espera.all y queryKeys.mesas.enVivo', () => {
      renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('espera.mesa_disponible', {
          mesaId: 'mesa-101',
          esperaId: 'esp-999',
          cliente: {
            nombre: 'Juan Valdés',
            cantidadPersonas: 4,
          },
        });
      });

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.espera.all,
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.enVivo(),
      });
    });

    it('ejecuta callback del suscriptor ante espera.mesa_disponible', () => {
      const onEsperaMock = vi.fn();
      renderHook(() => useSalaSocket({ onEsperaMesaDisponible: onEsperaMock }), {
        wrapper: createWrapper(),
      });

      const payload = {
        mesaId: 'mesa-102',
        esperaId: 'esp-888',
        cliente: {
          nombre: 'Mariana Lima',
          cantidadPersonas: 2,
        },
      };

      act(() => {
        mockSocketInstance.emit('espera.mesa_disponible', payload);
      });

      expect(onEsperaMock).toHaveBeenCalledWith(payload);
    });
  });

  describe('5. Reconexión y reconciliación de caché', () => {
    function assertReconnectedState(hookResult: {
      current: { isConnected: boolean; isReconnecting: boolean };
    }) {
      expect(hookResult.current.isConnected).toBe(true);
      expect(hookResult.current.isReconnecting).toBe(false);
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.mesas.all,
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.reservas.all,
      });
    }

    it('invalida inmediatamente mesas.all y reservas.all al emitirse connect', () => {
      const { result } = renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('connect');
      });

      assertReconnectedState(result);
    });

    it('invalida mesas.all y reservas.all y actualiza estado tras desconexión y reconexión', () => {
      const { result } = renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      // Conexión inicial
      act(() => {
        mockSocketInstance.emit('connect');
      });
      expect(result.current.isConnected).toBe(true);

      // Simular desconexión por pérdida de transporte
      act(() => {
        mockSocketInstance.emit('disconnect', 'transport close');
      });
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isReconnecting).toBe(true);

      // Reset de llamadas para aislar el evento de reconexión
      vi.mocked(queryClient.invalidateQueries).mockClear();

      // Simular reconexión exitosa
      act(() => {
        mockSocketInstance.emit('reconnect');
      });

      assertReconnectedState(result);
    });

    it('marca isReconnecting en connect_error y reconnect_attempt', () => {
      const { result } = renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      act(() => {
        mockSocketInstance.emit('connect_error', new Error('Network timeout'));
      });
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isReconnecting).toBe(true);

      act(() => {
        mockSocketInstance.emit('reconnect_attempt');
      });
      expect(result.current.isReconnecting).toBe(true);
    });
  });

  describe('6. Limpieza y prevención de fugas de memoria', () => {
    it('remueve los listeners específicos del suscriptor al desmontar el hook', () => {
      const onMesa = vi.fn();
      const onReserva = vi.fn();
      const onEspera = vi.fn();

      const { unmount } = renderHook(
        () =>
          useSalaSocket({
            onMesaEstadoActualizado: onMesa,
            onReservaProximaAlerta: onReserva,
            onEsperaMesaDisponible: onEspera,
          }),
        { wrapper: createWrapper() },
      );

      expect(mockSocketInstance.on).toHaveBeenCalledWith('mesa.estado_actualizado', onMesa);
      expect(mockSocketInstance.on).toHaveBeenCalledWith('reserva.proxima_alerta', onReserva);
      expect(mockSocketInstance.on).toHaveBeenCalledWith('espera.mesa_disponible', onEspera);

      unmount();

      expect(mockSocketInstance.off).toHaveBeenCalledWith('mesa.estado_actualizado', onMesa);
      expect(mockSocketInstance.off).toHaveBeenCalledWith('reserva.proxima_alerta', onReserva);
      expect(mockSocketInstance.off).toHaveBeenCalledWith('espera.mesa_disponible', onEspera);
    });

    it('cierra suscripciones y desconecta el socket al desmontar el Provider', () => {
      const { unmount } = renderHook(() => useSalaSocket(), { wrapper: createWrapper() });

      unmount();

      expect(mockSocketInstance.off).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocketInstance.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocketInstance.off).toHaveBeenCalledWith(
        'mesa.estado_actualizado',
        expect.any(Function),
      );
      expect(mockSocketInstance.off).toHaveBeenCalledWith(
        'reserva.proxima_alerta',
        expect.any(Function),
      );
      expect(mockSocketInstance.off).toHaveBeenCalledWith(
        'espera.mesa_disponible',
        expect.any(Function),
      );
      expect(mockSocketInstance.disconnect).toHaveBeenCalled();
    });

    it('retorna estado desconectado por defecto si useSalaSocket se invoca sin provider', () => {
      const { result } = renderHook(() => useSalaSocket());
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isReconnecting).toBe(false);
      expect(result.current.socket).toBeNull();
      expect(result.current.lastEvent).toBeNull();
    });
  });
});
