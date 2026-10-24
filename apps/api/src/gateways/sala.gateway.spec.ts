import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import {
  EstadoMesa,
  EVENT_TOPICS,
  type EsperaMesaDisponiblePayload,
  type MesaEstadoActualizadoPayload,
  type ReservaProximaAlertaPayload,
} from '@floor/shared';
import { createHmac } from 'node:crypto';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import type { Server, Socket as ServerSocket } from 'socket.io';
import type { OutboxRelayService } from '../events/outbox-relay.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_JWT_SECRET,
  esSalaTematicaValida,
  extraerTokenHandshake,
  firmarTokenJwtHs256,
  GatewaysModule,
  resolverCorsOrigin,
  resolverSalasSolicitadas,
  SALA_WS_EVENTS,
  SALA_WS_NAMESPACE,
  SALA_WS_ROOMS,
  SalaWebSocketGateway,
  verificarTokenJwtHs256,
} from './index';

describe('SalaWebSocketGateway y utilidades JWT (BE-005)', () => {
  const TOKEN_SIMULADO = firmarTokenJwtHs256({
    sub: '550e8400-e29b-41d4-a716-446655440001',
    staffId: 'M000104',
    roles: ['MESERO'],
    iss: 'urn:fmat:restaurant:auth',
  });

  describe('ws-jwt.util · Extracción y validación HS256 (SPEC §6.2, ADR-007)', () => {
    it('firma y verifica un token HS256 válido con roles e identidad', () => {
      const verificado = verificarTokenJwtHs256(`Bearer ${TOKEN_SIMULADO}`);

      expect(verificado).toMatchObject({
        sub: '550e8400-e29b-41d4-a716-446655440001',
        staffId: 'M000104',
        roles: ['MESERO'],
      });
    });

    it('rechaza tokens vacíos, malformados, con algoritmo distinto, firma inválida, payload inválido, sin sub o expirados', () => {
      expect(verificarTokenJwtHs256(null)).toBeNull();
      expect(verificarTokenJwtHs256('   ')).toBeNull();
      expect(verificarTokenJwtHs256('Bearer   ')).toBeNull();
      expect(verificarTokenJwtHs256('solo.dos')).toBeNull();
      expect(verificarTokenJwtHs256('..')).toBeNull();

      // Header con algoritmo distinto de HS256
      const headerNone = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      const payloadValido = Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url');
      expect(verificarTokenJwtHs256(`${headerNone}.${payloadValido}.sig`)).toBeNull();

      // Header JSON inválido o no-objeto
      const headerInvalido = Buffer.from('no-json').toString('base64url');
      expect(verificarTokenJwtHs256(`${headerInvalido}.${payloadValido}.sig`)).toBeNull();
      const headerArray = Buffer.from('[]').toString('base64url');
      expect(verificarTokenJwtHs256(`${headerArray}.${payloadValido}.sig`)).toBeNull();

      // Payload con firma válida pero JSON no-objeto
      const headerHs256 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payloadNoObj = Buffer.from('[]').toString('base64url');
      const sigNoObj = createHmac('sha256', DEFAULT_JWT_SECRET)
        .update(`${headerHs256}.${payloadNoObj}`)
        .digest('base64url');
      expect(
        verificarTokenJwtHs256(`${headerHs256}.${payloadNoObj}.${sigNoObj}`, DEFAULT_JWT_SECRET),
      ).toBeNull();

      // Firma con otro secreto
      const otroSecreto = firmarTokenJwtHs256({ sub: 'u1' }, 'otro-secreto');
      expect(verificarTokenJwtHs256(otroSecreto, DEFAULT_JWT_SECRET)).toBeNull();

      // Payload sin sub válido
      const sinSub = firmarTokenJwtHs256({ sub: '   ' });
      expect(verificarTokenJwtHs256(sinSub)).toBeNull();

      // Token expirado
      const expirado = firmarTokenJwtHs256({
        sub: 'u1',
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      expect(verificarTokenJwtHs256(expirado)).toBeNull();

      // Token con exp futuro válido
      const vigente = firmarTokenJwtHs256({
        sub: 'u1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      expect(verificarTokenJwtHs256(vigente)?.sub).toBe('u1');
    });

    it('extrae el token en orden de prioridad: auth.token -> headers.authorization -> query.token', () => {
      expect(extraerTokenHandshake(undefined)).toBeNull();
      expect(extraerTokenHandshake({ handshake: undefined } as unknown as ServerSocket)).toBeNull();

      const desdeAuth = extraerTokenHandshake({
        handshake: {
          auth: { token: 'Bearer tok-auth' },
          headers: { authorization: 'Bearer tok-header' },
          query: { token: 'tok-query' },
        },
      } as unknown as ServerSocket);
      expect(desdeAuth).toBe('tok-auth');

      const desdeHeaderArray = extraerTokenHandshake({
        handshake: {
          auth: {},
          headers: { authorization: ['Bearer tok-header-arr'] },
          query: {},
        },
      } as unknown as ServerSocket);
      expect(desdeHeaderArray).toBe('tok-header-arr');

      const desdeQueryArray = extraerTokenHandshake({
        handshake: {
          auth: { token: 123 },
          headers: {},
          query: { token: ['tok-query-arr'] },
        },
      } as unknown as ServerSocket);
      expect(desdeQueryArray).toBe('tok-query-arr');
    });
  });

  describe('CORS y validación de salas temáticas', () => {
    it('resuelve CORS_ORIGIN con valores por defecto, un solo origen o múltiples orígenes', () => {
      expect(resolverCorsOrigin(undefined)).toEqual([
        'http://localhost:3000',
        'http://localhost:5173',
      ]);
      expect(resolverCorsOrigin('   ')).toEqual(['http://localhost:3000', 'http://localhost:5173']);
      expect(resolverCorsOrigin(' , , ')).toEqual([
        'http://localhost:3000',
        'http://localhost:5173',
      ]);
      expect(resolverCorsOrigin('https://pos.fmat.mx')).toBe('https://pos.fmat.mx');
      expect(resolverCorsOrigin('http://localhost:3000, https://pos.fmat.mx')).toEqual([
        'http://localhost:3000',
        'https://pos.fmat.mx',
      ]);
    });

    it('valida y normaliza los distintos formatos de payload para unirse a salas temáticas', () => {
      expect(esSalaTematicaValida('plano')).toBe(true);
      expect(esSalaTematicaValida('recepcion')).toBe(true);
      expect(esSalaTematicaValida('cocina')).toBe(false);

      expect(resolverSalasSolicitadas('plano')).toEqual(['plano']);
      expect(resolverSalasSolicitadas(['plano', 'recepcion', 'plano'])).toEqual([
        'plano',
        'recepcion',
      ]);
      expect(resolverSalasSolicitadas({ room: 'recepcion' })).toEqual(['recepcion']);
      expect(resolverSalasSolicitadas({ sala: 'plano' })).toEqual(['plano']);
      expect(resolverSalasSolicitadas({ rooms: ['plano', 'recepcion'] })).toEqual([
        'plano',
        'recepcion',
      ]);
      expect(resolverSalasSolicitadas({ salas: ['recepcion'] })).toEqual(['recepcion']);

      expect(() => resolverSalasSolicitadas(null)).toThrow(WsException);
      expect(() => resolverSalasSolicitadas({})).toThrow(WsException);
      expect(() => resolverSalasSolicitadas('invalida')).toThrow(WsException);
      expect(() => resolverSalasSolicitadas([123])).toThrow(WsException);
    });
  });

  describe('Comportamiento unitario de SalaWebSocketGateway y conexión con OutboxRelayService', () => {
    it('desconecta en handleConnection cuando el socket no presenta un token válido y acepta cuando es válido', () => {
      const gateway = new SalaWebSocketGateway();
      const disconnect = jest.fn();
      const socketInvalido = {
        id: 'sock-1',
        handshake: { auth: {}, headers: {}, query: {} },
        data: {},
        disconnect,
      } as unknown as ServerSocket;

      expect(gateway.handleConnection(socketInvalido)).toBe(false);
      expect(disconnect).toHaveBeenCalledWith(true);

      const socketValido = {
        id: 'sock-2',
        handshake: { auth: { token: `Bearer ${TOKEN_SIMULADO}` }, headers: {}, query: {} },
        data: null,
        disconnect: jest.fn(),
      } as unknown as ServerSocket;

      expect(gateway.handleConnection(socketValido)).toBe(true);
      expect((socketValido.data as any).user.sub).toBe('550e8400-e29b-41d4-a716-446655440001');
      gateway.handleDisconnect(socketValido);
    });

    it('rechaza handleJoinRoom si el socket no está autenticado', async () => {
      const gateway = new SalaWebSocketGateway();
      const disconnect = jest.fn();
      const socketSinAuth = {
        id: 'sock-no-auth',
        handshake: { auth: {}, headers: {}, query: {} },
        data: {},
        disconnect,
      } as unknown as ServerSocket;

      await expect(gateway.handleJoinRoom(socketSinAuth, 'plano')).rejects.toThrow(WsException);
      expect(disconnect).toHaveBeenCalledWith(true);
    });

    it('se suscribe a OutboxRelayService y difunde eventos de mesa, reserva y espera', async () => {
      let listenerCapturado: ((evento: any) => Promise<void> | void) | null = null;
      const unsubscribeMock = jest.fn();
      const relayMock = {
        registerListener: jest.fn((cb) => {
          listenerCapturado = cb;
          return unsubscribeMock;
        }),
      } as unknown as OutboxRelayService;

      const gateway = new SalaWebSocketGateway(relayMock);
      const emitRoomMock = jest.fn();
      const toMock = jest.fn().mockReturnValue({ emit: emitRoomMock });
      gateway.server = {
        to: toMock,
        emit: jest.fn(),
      } as unknown as Server;

      gateway.onModuleInit();
      expect(relayMock.registerListener).toHaveBeenCalledTimes(1);

      const payloadMesa: MesaEstadoActualizadoPayload = {
        mesaId: 'mesa-1',
        estado: EstadoMesa.OCUPADA,
        unionId: null,
        timestamp: '2026-10-24T18:00:00.000Z',
      };
      await listenerCapturado?.({
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload: payloadMesa,
      });

      expect(toMock).toHaveBeenCalledWith(SALA_WS_ROOMS.PLANO);
      expect(emitRoomMock).toHaveBeenCalledWith(
        SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO,
        payloadMesa,
      );

      const payloadReserva: ReservaProximaAlertaPayload = {
        reservaId: 'res-1',
        mesaId: 'mesa-1',
        nombreContacto: 'Ana López',
        horaInicio: '2026-10-24T19:00:00.000Z',
        minutosRestantes: 15,
        timestamp: '2026-10-24T18:45:00.000Z',
      };
      await listenerCapturado?.({
        routingKey: EVENT_TOPICS.RESERVA_PROXIMA_ALERTA,
        payload: payloadReserva,
      });

      expect(toMock).toHaveBeenCalledWith(SALA_WS_ROOMS.RECEPCION);
      expect(emitRoomMock).toHaveBeenCalledWith(
        SALA_WS_EVENTS.RESERVA_PROXIMA_ALERTA,
        payloadReserva,
      );

      const payloadEspera: EsperaMesaDisponiblePayload = {
        mesaId: 'mesa-1',
        esperaId: 'esp-1',
        cliente: { nombre: 'Carlos Ruiz', cantidadPersonas: 2 },
      };
      gateway.emitirEsperaMesaDisponible(payloadEspera, [SALA_WS_ROOMS.RECEPCION]);
      expect(toMock).toHaveBeenCalledWith([SALA_WS_ROOMS.RECEPCION]);
      expect(emitRoomMock).toHaveBeenCalledWith(
        SALA_WS_EVENTS.ESPERA_MESA_DISPONIBLE,
        payloadEspera,
      );

      // Emite también con arrays en mesa y reserva
      gateway.emitirMesaEstadoActualizado(payloadMesa, [SALA_WS_ROOMS.PLANO]);
      gateway.emitirReservaProximaAlerta(payloadReserva, [SALA_WS_ROOMS.RECEPCION]);

      // Ignora payloads nulos o cuando server no está definido
      gateway.procesarEventoOutbox({ routingKey: 'otro', payload: null as any });
      gateway.server = undefined as unknown as Server;
      gateway.emitirMesaEstadoActualizado(payloadMesa);
      gateway.emitirReservaProximaAlerta(payloadReserva);
      gateway.emitirEsperaMesaDisponible(payloadEspera);

      gateway.onModuleDestroy();
      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integración Socket.io en tiempo real con socket.io-client en /sala', () => {
    let app: INestApplication;
    let gateway: SalaWebSocketGateway;
    let baseWsUrl: string;
    const clientesActivos: ClientSocket[] = [];

    function crearCliente(opciones: Parameters<typeof io>[1]): ClientSocket {
      const cliente = io(`${baseWsUrl}${SALA_WS_NAMESPACE}`, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        ...opciones,
      });
      clientesActivos.push(cliente);
      return cliente;
    }

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [GatewaysModule],
      })
        .overrideProvider(PrismaService)
        .useValue({
          $connect: jest.fn(),
          $disconnect: jest.fn(),
        })
        .compile();

      app = moduleRef.createNestApplication();
      await app.listen(0);
      baseWsUrl = await app.getUrl();
      gateway = moduleRef.get(SalaWebSocketGateway);
    });

    afterEach(() => {
      while (clientesActivos.length > 0) {
        const cliente = clientesActivos.pop();
        cliente?.disconnect();
      }
    });

    afterAll(async () => {
      await app.close();
    });

    it('rechaza la conexión durante el handshake si no se envía token o si el token es inválido', async () => {
      const clienteSinToken = crearCliente({ auth: {} });

      const errorSinToken = await new Promise<Error>((resolve, reject) => {
        clienteSinToken.once('connect', () =>
          reject(new Error('No debía permitir conectarse sin token')),
        );
        clienteSinToken.once('connect_error', (err) => resolve(err));
      });
      expect(errorSinToken.message).toContain('UNAUTHORIZED');

      const clienteTokenInvalido = crearCliente({
        auth: { token: 'Bearer token.falso.invalido' },
      });

      const errorTokenInvalido = await new Promise<Error>((resolve, reject) => {
        clienteTokenInvalido.once('connect', () =>
          reject(new Error('No debía permitir conectarse con token inválido')),
        );
        clienteTokenInvalido.once('connect_error', (err) => resolve(err));
      });
      expect(errorTokenInvalido.message).toContain('UNAUTHORIZED');
    });

    it('permite conectarse exitosamente al namespace /sala pasando un token JWT simulado en auth o query y recibir eventos globales', async () => {
      const clienteAuth = crearCliente({
        auth: { token: `Bearer ${TOKEN_SIMULADO}` },
      });

      await new Promise<void>((resolve, reject) => {
        clienteAuth.once('connect', () => resolve());
        clienteAuth.once('connect_error', (err) => reject(err));
      });
      expect(clienteAuth.connected).toBe(true);

      // Recibe difusión cuando aún no hay clientes en salas temáticas específicas
      const payloadGlobal: MesaEstadoActualizadoPayload = {
        mesaId: '00000000-0000-4000-8000-000000000099',
        estado: EstadoMesa.LIBRE,
        unionId: null,
        timestamp: new Date('2026-10-24T12:00:00.000Z').toISOString(),
      };
      const recibidoGlobalPromesa = new Promise<MesaEstadoActualizadoPayload>((resolve) => {
        clienteAuth.once(SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO, resolve);
      });
      gateway.emitirMesaEstadoActualizado(payloadGlobal);
      await expect(recibidoGlobalPromesa).resolves.toEqual(payloadGlobal);

      const clienteQuery = crearCliente({
        query: { token: TOKEN_SIMULADO },
      });

      await new Promise<void>((resolve, reject) => {
        clienteQuery.once('connect', () => resolve());
        clienteQuery.once('connect_error', (err) => reject(err));
      });
      expect(clienteQuery.connected).toBe(true);
    });

    it('permite a clientes autenticados unirse a las salas temáticas (plano, recepcion) y recibir mesa.estado_actualizado', async () => {
      const clientePlano = crearCliente({
        auth: { token: `Bearer ${TOKEN_SIMULADO}` },
      });
      const clienteRecepcion = crearCliente({
        auth: { token: `Bearer ${TOKEN_SIMULADO}` },
      });

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          clientePlano.once('connect', () => resolve());
          clientePlano.once('connect_error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          clienteRecepcion.once('connect', () => resolve());
          clienteRecepcion.once('connect_error', reject);
        }),
      ]);

      const ackPlano = await clientePlano.emitWithAck('joinRoom', { room: 'plano' });
      expect(ackPlano).toEqual({
        ok: true,
        room: 'plano',
        salas: ['plano'],
      });

      const ackRecepcion = await clienteRecepcion.emitWithAck('unirse_sala', 'recepcion');
      expect(ackRecepcion).toEqual({
        ok: true,
        room: 'recepcion',
        salas: ['recepcion'],
      });

      let recibidoEnRecepcion = false;
      clienteRecepcion.on(SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO, () => {
        recibidoEnRecepcion = true;
      });

      const payloadEsperado: MesaEstadoActualizadoPayload = {
        mesaId: '11111111-1111-4111-8111-111111111111',
        estado: EstadoMesa.LIMPIEZA_PENDIENTE,
        unionId: null,
        timestamp: new Date('2026-10-24T12:30:00.000Z').toISOString(),
      };

      const eventoRecibidoPromesa = new Promise<MesaEstadoActualizadoPayload>((resolve) => {
        clientePlano.once(
          SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO,
          (data: MesaEstadoActualizadoPayload) => {
            resolve(data);
          },
        );
      });

      gateway.emitirMesaEstadoActualizado(payloadEsperado);

      const eventoRecibido = await eventoRecibidoPromesa;
      expect(eventoRecibido).toEqual(payloadEsperado);
      expect(recibidoEnRecepcion).toBe(false);
    });
  });
});
