import { createContext, useContext, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import type {
  EsperaMesaDisponiblePayload,
  MesaEstadoActualizadoPayload,
  ReservaProximaAlertaPayload,
} from '@floor/shared';
import { getSessionToken } from '../api/client';

export * from './SalaSocketProvider';

export interface SalaSocketEventMeta {
  name: string;
  timestamp: number;
}

export interface UseSalaSocketReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  socket: Socket | null;
  lastEvent: SalaSocketEventMeta | null;
}

export interface UseSalaSocketOptions {
  onMesaEstadoActualizado?: (payload: MesaEstadoActualizadoPayload) => void;
  onReservaProximaAlerta?: (payload: ReservaProximaAlertaPayload) => void;
  onEsperaMesaDisponible?: (payload: EsperaMesaDisponiblePayload) => void;
}

export interface SalaSocketProviderProps {
  children?: ReactNode;
  socket?: Socket | null;
  url?: string;
  authToken?: string | null;
  autoConnect?: boolean;
  queryClient?: QueryClient;
  onMesaEstadoActualizado?: (payload: MesaEstadoActualizadoPayload) => void;
  onReservaProximaAlerta?: (payload: ReservaProximaAlertaPayload) => void;
  onEsperaMesaDisponible?: (payload: EsperaMesaDisponiblePayload) => void;
}

export const SalaSocketContext = createContext<UseSalaSocketReturn | null>(null);

function stripTrailingSlashes(str: string): string {
  let result = str;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

export function getSalaSocketUrl(customBaseUrl?: string): string {
  let base = customBaseUrl || import.meta.env.VITE_WS_URL;
  if (!base) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      base = window.location.origin;
    } else {
      base = 'http://localhost:3000';
    }
  }
  const cleanBase = stripTrailingSlashes(base);
  if (cleanBase.endsWith('/sala')) {
    return cleanBase;
  }
  return `${cleanBase}/sala`;
}

export function getAuthToken(): string | null {
  const token = getSessionToken();
  if (!token) return null;
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

export function useSalaSocketContext(): UseSalaSocketReturn {
  const context = useContext(SalaSocketContext);
  if (!context) {
    return {
      isConnected: false,
      isReconnecting: false,
      socket: null,
      lastEvent: null,
    };
  }
  return context;
}
