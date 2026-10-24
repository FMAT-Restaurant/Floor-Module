import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoMesa, type MesaEstadoActualizadoPayload } from '@floor/shared';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.setup';
import {
  firmarTokenJwtHs256,
  SALA_WS_EVENTS,
  SALA_WS_NAMESPACE,
  SALA_WS_ROOMS,
  SalaWebSocketGateway,
} from '../../src/gateways';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * BE-005 · Prueba de integración WebSocket en el namespace `/sala` con `socket.io-client`
 * (RF-009, RNF-002, SPEC §6.2, ADR-004, ADR-007).
 */
describe('SalaWebSocketGateway Integración E2E (BE-005)', () => {
  let app: NestExpressApplication;
  let gateway: SalaWebSocketGateway;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  const tokenValido = firmarTokenJwtHs256({
    sub: '550e8400-e29b-41d4-a716-446655440010',
    staffId: 'M000104',
    roles: ['MESERO', 'HOST'],
    iss: 'urn:fmat:restaurant:auth',
  });

  function conectarCliente(opciones: Parameters<typeof io>[1]): ClientSocket {
    const client = io(`${baseUrl}${SALA_WS_NAMESPACE}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      ...opciones,
    });
    sockets.push(client);
    return client;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    gateway = modulo.get(SalaWebSocketGateway);
  });

  afterEach(() => {
    while (sockets.length > 0) {
      sockets.pop()?.disconnect();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('conecta exitosamente al namespace /sala con un token JWT simulado y rechaza conexiones sin token', async () => {
    const sinToken = conectarCliente({ auth: {} });
    await expect(
      new Promise<void>((resolve, reject) => {
        sinToken.once('connect', () => resolve());
        sinToken.once('connect_error', (err) => reject(err));
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);

    const conToken = conectarCliente({
      auth: { token: `Bearer ${tokenValido}` },
    });
    await new Promise<void>((resolve, reject) => {
      conToken.once('connect', () => resolve());
      conToken.once('connect_error', (err) => reject(err));
    });

    expect(conToken.connected).toBe(true);
  });

  it('une clientes autenticados a salas temáticas (plano, recepcion) y entrega mesa.estado_actualizado en < 2s (RNF-002)', async () => {
    const clientePlano = conectarCliente({
      auth: { token: `Bearer ${tokenValido}` },
    });

    await new Promise<void>((resolve, reject) => {
      clientePlano.once('connect', () => resolve());
      clientePlano.once('connect_error', (err) => reject(err));
    });

    const respuestaJoin = await clientePlano.emitWithAck('joinRoom', SALA_WS_ROOMS.PLANO);
    expect(respuestaJoin).toEqual({
      ok: true,
      room: 'plano',
      salas: ['plano'],
    });

    const payload: MesaEstadoActualizadoPayload = {
      mesaId: '22222222-2222-4222-8222-222222222222',
      estado: EstadoMesa.OCUPADA,
      unionId: null,
      timestamp: new Date().toISOString(),
    };

    const inicio = Date.now();
    const recibidoPromesa = new Promise<MesaEstadoActualizadoPayload>((resolve) => {
      clientePlano.once(SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO, (evento) => resolve(evento));
    });

    gateway.emitirMesaEstadoActualizado(payload);

    const recibido = await recibidoPromesa;
    const latenciaMs = Date.now() - inicio;

    expect(recibido).toEqual(payload);
    expect(latenciaMs).toBeLessThan(2000);
  });
});
