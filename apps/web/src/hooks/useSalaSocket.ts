import { useEffect } from 'react';
import {
  useSalaSocketContext,
  type UseSalaSocketOptions,
  type UseSalaSocketReturn,
} from '../context';

export * from '../context';

export function useSalaSocket(options?: UseSalaSocketOptions): UseSalaSocketReturn {
  const context = useSalaSocketContext();
  const socket = context.socket;

  useEffect(() => {
    if (!socket) return;

    const onMesa = options?.onMesaEstadoActualizado;
    const onReserva = options?.onReservaProximaAlerta;
    const onEspera = options?.onEsperaMesaDisponible;

    if (onMesa) {
      socket.on('mesa.estado_actualizado', onMesa);
    }
    if (onReserva) {
      socket.on('reserva.proxima_alerta', onReserva);
    }
    if (onEspera) {
      socket.on('espera.mesa_disponible', onEspera);
    }

    return () => {
      if (onMesa) {
        socket.off('mesa.estado_actualizado', onMesa);
      }
      if (onReserva) {
        socket.off('reserva.proxima_alerta', onReserva);
      }
      if (onEspera) {
        socket.off('espera.mesa_disponible', onEspera);
      }
    };
  }, [
    socket,
    options?.onMesaEstadoActualizado,
    options?.onReservaProximaAlerta,
    options?.onEsperaMesaDisponible,
  ]);

  return context;
}
