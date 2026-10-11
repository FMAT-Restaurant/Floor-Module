import { http, HttpResponse, ws } from 'msw';
import { mockSalaSimulation } from '../simulation';

// Enlace WebSocket de MSW para interceptar conexiones en cualquier host o puerto
export const salaWs = ws.link(/.*/);

// Configurar el broadcaster de la simulación para emitir a través de MSW ws
mockSalaSimulation.setWsBroadcaster((event, payload) => {
  try {
    // Formato JSON estándar
    salaWs.broadcast(JSON.stringify({ event, data: payload }));
    // Formato paquete Engine.IO / Socket.io namespace /sala
    salaWs.broadcast(`42/sala,["${event}",${JSON.stringify(payload)}]`);
    // Formato paquete Engine.IO / Socket.io namespace raíz
    salaWs.broadcast(`42,["${event}",${JSON.stringify(payload)}]`);
  } catch {
    // Si no hay clientes activos o la transmisión no está lista, ignorar
  }
});

export const salaWsHandler = salaWs.addEventListener('connection', ({ client }) => {
  // Enviar confirmación de bienvenida / handshake simulado
  try {
    // Engine.IO open packet
    client.send('0{"sid":"mock-sala-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
    // Socket.io namespace connect ack
    client.send('40/sala,{"sid":"mock-sala-sid"}');
  } catch {
    // Ignorar si el cliente no acepta formato string
  }

  client.addEventListener('message', (event) => {
    const data = typeof event.data === 'string' ? event.data : '';
    // Responder a ping de Engine.IO ("2") con pong ("3")
    if (data === '2') {
      client.send('3');
    }
  });
});

export const wsHandlers = [
  salaWsHandler,

  // Fallback para handshake HTTP de Socket.io (polling)
  http.get('*/socket.io/*', ({ request }) => {
    const url = new URL(request.url);
    const transport = url.searchParams.get('transport');

    if (transport === 'polling') {
      // Si aún no tiene sid, enviar handshake de Engine.IO
      const hasSid = url.searchParams.has('sid');
      if (!hasSid) {
        return new HttpResponse(
          '0{"sid":"mock-socket-sid","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}',
          {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
          },
        );
      }
      // Si ya tiene sid, responder con confirmación de namespace
      return new HttpResponse('40/sala,{"sid":"mock-socket-sid"}', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      });
    }

    return new HttpResponse('ok', { status: 200 });
  }),

  http.post('*/socket.io/*', () => {
    return new HttpResponse('ok', { status: 200 });
  }),
];
