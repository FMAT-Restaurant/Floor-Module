import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  EsperaMesaDisponiblePayload,
  MesaEstadoActualizadoPayload,
  ReservaProximaAlertaPayload,
} from '@floor/shared';
import { queryClient as defaultQueryClient } from '../api/queryClient';
import { queryKeys } from '../api/queryKeys';
import {
  SalaSocketContext,
  getAuthToken,
  getSalaSocketUrl,
  type SalaSocketEventMeta,
  type SalaSocketProviderProps,
  type UseSalaSocketReturn,
} from './SalaSocketContext';

function useSafeQueryClient(customClient?: QueryClient): QueryClient {
  try {
    const contextClient = useQueryClient();
    return customClient || contextClient;
  } catch {
    return customClient || defaultQueryClient;
  }
}

export function SalaSocketProvider({
  children,
  socket: customSocket,
  url,
  authToken,
  autoConnect = true,
  queryClient: propQueryClient,
  onMesaEstadoActualizado,
  onReservaProximaAlerta,
  onEsperaMesaDisponible,
}: Readonly<SalaSocketProviderProps>) {
  const queryClient = useSafeQueryClient(propQueryClient);

  const [socket, setSocket] = useState<Socket | null>(() => customSocket ?? null);
  const [isConnected, setIsConnected] = useState<boolean>(() => customSocket?.connected ?? false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<SalaSocketEventMeta | null>(null);

  const providerCallbacksRef = useRef({
    onMesaEstadoActualizado,
    onReservaProximaAlerta,
    onEsperaMesaDisponible,
  });

  useEffect(() => {
    providerCallbacksRef.current = {
      onMesaEstadoActualizado,
      onReservaProximaAlerta,
      onEsperaMesaDisponible,
    };
  }, [onMesaEstadoActualizado, onReservaProximaAlerta, onEsperaMesaDisponible]);

  useEffect(() => {
    let activeSocket = customSocket;
    let isCreatedLocally = false;

    if (!activeSocket) {
      const socketUrl = getSalaSocketUrl(url);
      const token = authToken !== undefined ? authToken : getAuthToken();

      activeSocket = io(socketUrl, {
        auth: { token: token ?? null },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        autoConnect,
      });
      isCreatedLocally = true;
      setSocket(activeSocket);
    } else {
      setSocket(activeSocket);
      setIsConnected(activeSocket.connected);
    }

    const s = activeSocket;

    const invalidateOnReconnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all });
    };

    const handleConnect = () => {
      invalidateOnReconnect();
    };

    const handleDisconnect = (reason?: string) => {
      setIsConnected(false);
      if (reason !== 'io client disconnect') {
        setIsReconnecting(true);
      }
    };

    const handleReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    const handleConnectError = () => {
      setIsConnected(false);
      setIsReconnecting(true);
    };

    const handleMesaEstadoActualizado = (payload: MesaEstadoActualizadoPayload) => {
      setLastEvent({ name: 'mesa.estado_actualizado', timestamp: Date.now() });

      void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.enVivo() });

      if (payload?.mesaId != null) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.mesas.detail(String(payload.mesaId)),
        });
      }

      if (Array.isArray(payload?.mesasIds)) {
        payload.mesasIds.forEach((id) => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.mesas.detail(String(id)),
          });
        });
      }

      if (payload?.unionId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.uniones.all });
      }

      providerCallbacksRef.current.onMesaEstadoActualizado?.(payload);
    };

    const handleReservaProximaAlerta = (payload: ReservaProximaAlertaPayload) => {
      setLastEvent({ name: 'reserva.proxima_alerta', timestamp: Date.now() });

      void queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.enVivo() });

      providerCallbacksRef.current.onReservaProximaAlerta?.(payload);
    };

    const handleEsperaMesaDisponible = (payload: EsperaMesaDisponiblePayload) => {
      setLastEvent({ name: 'espera.mesa_disponible', timestamp: Date.now() });

      void queryClient.invalidateQueries({ queryKey: queryKeys.espera.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mesas.enVivo() });

      providerCallbacksRef.current.onEsperaMesaDisponible?.(payload);
    };

    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    s.on('connect_error', handleConnectError);
    s.on('reconnect', handleConnect);
    s.on('reconnect_attempt', handleReconnectAttempt);

    if (s.io) {
      s.io.on('reconnect', handleConnect);
      s.io.on('reconnect_attempt', handleReconnectAttempt);
      s.io.on('reconnect_error', handleConnectError);
    }

    s.on('mesa.estado_actualizado', handleMesaEstadoActualizado);
    s.on('reserva.proxima_alerta', handleReservaProximaAlerta);
    s.on('espera.mesa_disponible', handleEsperaMesaDisponible);

    if (s.connected) {
      setIsConnected(true);
      setIsReconnecting(false);
    }

    return () => {
      s.off('connect', handleConnect);
      s.off('disconnect', handleDisconnect);
      s.off('connect_error', handleConnectError);
      s.off('reconnect', handleConnect);
      s.off('reconnect_attempt', handleReconnectAttempt);

      if (s.io) {
        s.io.off('reconnect', handleConnect);
        s.io.off('reconnect_attempt', handleReconnectAttempt);
        s.io.off('reconnect_error', handleConnectError);
      }

      s.off('mesa.estado_actualizado', handleMesaEstadoActualizado);
      s.off('reserva.proxima_alerta', handleReservaProximaAlerta);
      s.off('espera.mesa_disponible', handleEsperaMesaDisponible);

      if (isCreatedLocally) {
        s.disconnect();
      }
    };
  }, [customSocket, url, authToken, autoConnect, queryClient]);

  const value = useMemo<UseSalaSocketReturn>(
    () => ({
      isConnected,
      isReconnecting,
      socket,
      lastEvent,
    }),
    [isConnected, isReconnecting, socket, lastEvent],
  );

  return <SalaSocketContext.Provider value={value}>{children}</SalaSocketContext.Provider>;
}
