import { Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { OutboxEvento } from '@prisma/client';
import {
  EVENT_TOPICS,
  type EsperaMesaDisponiblePayload,
  type MesaEstadoActualizadoPayload,
  type ReservaProximaAlertaPayload,
} from '@floor/shared';
import type { Server, Socket } from 'socket.io';
import { OutboxRelayService } from '../events/outbox-relay.service';
import { extraerTokenHandshake, verificarTokenJwtHs256, type WsJwtPayload } from './ws-jwt.util';

export const SALA_WS_NAMESPACE = '/sala';

export const SALA_WS_ROOMS = {
  PLANO: 'plano',
  RECEPCION: 'recepcion',
} as const;

export type SalaTematica = (typeof SALA_WS_ROOMS)[keyof typeof SALA_WS_ROOMS];

export const SALAS_TEMATICAS_PERMITIDAS: readonly SalaTematica[] = [
  SALA_WS_ROOMS.PLANO,
  SALA_WS_ROOMS.RECEPCION,
];

export const SALA_WS_EVENTS = {
  MESA_ESTADO_ACTUALIZADO: 'mesa.estado_actualizado',
  RESERVA_PROXIMA_ALERTA: 'reserva.proxima_alerta',
  ESPERA_MESA_DISPONIBLE: 'espera.mesa_disponible',
} as const;

export interface JoinSalaPayload {
  room?: string;
  sala?: string;
  rooms?: string[];
  salas?: string[];
}

export interface JoinSalaAck {
  ok: true;
  room: SalaTematica;
  salas: SalaTematica[];
}

const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

/**
 * Resuelve los orígenes permitidos para CORS a partir de `CORS_ORIGIN`.
 */
export function resolverCorsOrigin(corsOriginEnv = process.env.CORS_ORIGIN): string | string[] {
  if (!corsOriginEnv || !corsOriginEnv.trim()) {
    return [...DEFAULT_CORS_ORIGINS];
  }
  const origenes = corsOriginEnv
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);

  if (origenes.length === 0) {
    return [...DEFAULT_CORS_ORIGINS];
  }
  return origenes.length === 1 ? origenes[0] : origenes;
}

export function esSalaTematicaValida(valor: unknown): valor is SalaTematica {
  return (
    typeof valor === 'string' && (SALAS_TEMATICAS_PERMITIDAS as readonly string[]).includes(valor)
  );
}

function extraerCandidatosSala(payload: unknown): unknown[] {
  if (typeof payload === 'string') {
    return [payload];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as JoinSalaPayload;
    if (Array.isArray(obj.salas)) return obj.salas;
    if (Array.isArray(obj.rooms)) return obj.rooms;
    if (obj.sala !== undefined) return [obj.sala];
    if (obj.room !== undefined) return [obj.room];
  }
  return [];
}

/**
 * Normaliza y valida el payload recibido al solicitar unirse a una o más salas temáticas.
 */
export function resolverSalasSolicitadas(payload: unknown): SalaTematica[] {
  const candidatos = extraerCandidatosSala(payload);
  if (candidatos.length === 0) {
    throw new WsException(
      `Sala temática requerida. Salas permitidas: ${SALAS_TEMATICAS_PERMITIDAS.join(', ')}`,
    );
  }

  const salasValidas: SalaTematica[] = [];
  for (const candidato of candidatos) {
    const limpio = typeof candidato === 'string' ? candidato.trim() : candidato;
    if (!esSalaTematicaValida(limpio)) {
      throw new WsException(
        `Sala temática inválida. Salas permitidas: ${SALAS_TEMATICAS_PERMITIDAS.join(', ')}`,
      );
    }
    if (!salasValidas.includes(limpio)) {
      salasValidas.push(limpio);
    }
  }

  return salasValidas;
}

/**
 * BE-005 · Gateway WebSocket de Sala y Reservas bajo el namespace `/sala`
 * (RF-009, RNF-002, SPEC §6.2, ADR-004, ADR-007).
 */
@WebSocketGateway({
  namespace: SALA_WS_NAMESPACE,
  cors: {
    origin: resolverCorsOrigin(process.env.CORS_ORIGIN),
    credentials: true,
  },
})
export class SalaWebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SalaWebSocketGateway.name);
  private unsubscribeOutbox: (() => void) | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(@Optional() private readonly outboxRelay?: OutboxRelayService) {}

  onModuleInit(): void {
    if (this.outboxRelay && !this.unsubscribeOutbox) {
      this.unsubscribeOutbox = this.outboxRelay.registerListener(async (evento) => {
        this.procesarEventoOutbox(evento);
      });
    }
  }

  onModuleDestroy(): void {
    if (this.unsubscribeOutbox) {
      this.unsubscribeOutbox();
      this.unsubscribeOutbox = null;
    }
  }

  /**
   * Registra el middleware de autenticación JWT en el handshake de Socket.io.
   */
  afterInit(server: Server): void {
    if (typeof server?.use === 'function') {
      server.use((socket: Socket, next: (err?: Error) => void) => {
        const payload = this.validarHandshakeJwt(socket);
        if (!payload) {
          this.logger.warn(
            JSON.stringify({
              msg: 'Conexión WebSocket rechazada en handshake: token JWT inválido o inexistente',
              socketId: socket.id,
            }),
          );
          next(new Error('UNAUTHORIZED: Token JWT inválido o inexistente'));
          return;
        }
        next();
      });
    }
  }

  /**
   * Verifica la identidad del cliente en `handleConnection` como defensa en profundidad
   * y desconecta inmediatamente si el token no existe o es inválido.
   */
  handleConnection(client: Socket): boolean {
    const payload = this.asegurarAutenticacionSocket(client);
    if (!payload) {
      this.logger.warn(
        JSON.stringify({
          msg: 'Cliente WebSocket desconectado en handleConnection: token JWT inválido o inexistente',
          socketId: client?.id,
        }),
      );
      client?.disconnect?.(true);
      return false;
    }

    this.logger.log(
      JSON.stringify({
        msg: 'Cliente autenticado conectado a /sala',
        socketId: client.id,
        userId: payload.sub,
        roles: payload.roles ?? [],
      }),
    );
    return true;
  }

  handleDisconnect(client: Socket): void {
    const user = (client?.data as { user?: WsJwtPayload } | undefined)?.user;
    this.logger.log(
      JSON.stringify({
        msg: 'Cliente desconectado de /sala',
        socketId: client?.id,
        userId: user?.sub ?? null,
      }),
    );
  }

  /**
   * Permite a los clientes autenticados unirse a salas temáticas (`'plano'` o `'recepcion'`).
   */
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: string | string[] | JoinSalaPayload,
  ): Promise<JoinSalaAck> {
    const usuario = this.asegurarAutenticacionSocket(client);
    if (!usuario) {
      client?.disconnect?.(true);
      throw new WsException('UNAUTHORIZED: Token JWT inválido o inexistente');
    }

    const salas = resolverSalasSolicitadas(payload);
    await Promise.all(salas.map((sala) => Promise.resolve(client.join(sala))));

    return {
      ok: true,
      room: salas[0],
      salas,
    };
  }

  /**
   * Alias en español para unirse a salas temáticas (`'plano'` o `'recepcion'`).
   */
  @SubscribeMessage('unirse_sala')
  async handleUnirseSala(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: string | string[] | JoinSalaPayload,
  ): Promise<JoinSalaAck> {
    return this.handleJoinRoom(client, payload);
  }

  /**
   * Emite el evento `mesa.estado_actualizado` a las salas correspondientes (por defecto `'plano'`).
   */
  emitirMesaEstadoActualizado(
    payload: MesaEstadoActualizadoPayload,
    salas: SalaTematica | readonly SalaTematica[] = SALA_WS_ROOMS.PLANO,
  ): void {
    if (!this.server) {
      return;
    }

    const destino = Array.isArray(salas) ? [...salas] : (salas as SalaTematica);
    this.server.to(destino).emit(SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO, payload);

    if (this.debeEmitirFallbackGlobal()) {
      this.server.emit(SALA_WS_EVENTS.MESA_ESTADO_ACTUALIZADO, payload);
    }
  }

  /**
   * Emite el evento `reserva.proxima_alerta` a la sala de recepción (`'recepcion'`).
   */
  emitirReservaProximaAlerta(
    payload: ReservaProximaAlertaPayload,
    salas: SalaTematica | readonly SalaTematica[] = SALA_WS_ROOMS.RECEPCION,
  ): void {
    if (!this.server) {
      return;
    }

    const destino = Array.isArray(salas) ? [...salas] : (salas as SalaTematica);
    this.server.to(destino).emit(SALA_WS_EVENTS.RESERVA_PROXIMA_ALERTA, payload);

    if (this.debeEmitirFallbackGlobal()) {
      this.server.emit(SALA_WS_EVENTS.RESERVA_PROXIMA_ALERTA, payload);
    }
  }

  /**
   * Emite el evento `espera.mesa_disponible` a la sala de recepción (`'recepcion'`).
   */
  emitirEsperaMesaDisponible(
    payload: EsperaMesaDisponiblePayload,
    salas: SalaTematica | readonly SalaTematica[] = SALA_WS_ROOMS.RECEPCION,
  ): void {
    if (!this.server) {
      return;
    }

    const destino = Array.isArray(salas) ? [...salas] : (salas as SalaTematica);
    this.server.to(destino).emit(SALA_WS_EVENTS.ESPERA_MESA_DISPONIBLE, payload);

    if (this.debeEmitirFallbackGlobal()) {
      this.server.emit(SALA_WS_EVENTS.ESPERA_MESA_DISPONIBLE, payload);
    }
  }

  /**
   * Procesa un evento publicado por `OutboxRelayService` y lo difunde por WebSocket.
   */
  procesarEventoOutbox(evento: Pick<OutboxEvento, 'routingKey' | 'payload'>): void {
    if (!evento || typeof evento.payload !== 'object' || evento.payload === null) {
      return;
    }

    if (evento.routingKey === EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO) {
      this.emitirMesaEstadoActualizado(evento.payload as unknown as MesaEstadoActualizadoPayload);
      return;
    }

    if (evento.routingKey === EVENT_TOPICS.RESERVA_PROXIMA_ALERTA) {
      this.emitirReservaProximaAlerta(evento.payload as unknown as ReservaProximaAlertaPayload);
    }
  }

  private asegurarAutenticacionSocket(client: Socket): WsJwtPayload | null {
    const existente = (client?.data as { user?: WsJwtPayload } | undefined)?.user;
    if (existente?.sub) {
      return existente;
    }
    return this.validarHandshakeJwt(client);
  }

  private validarHandshakeJwt(client: Socket): WsJwtPayload | null {
    const token = extraerTokenHandshake(client);
    const payload = verificarTokenJwtHs256(token);
    if (!payload) {
      return null;
    }

    if (client) {
      const dataActual = typeof client.data === 'object' && client.data !== null ? client.data : {};
      client.data = {
        ...dataActual,
        user: payload,
      };
    }

    return payload;
  }

  /**
   * Cuando ningún cliente se ha unido explícitamente a una sala temática (`plano` o `recepcion`),
   * permite que clientes suscritos sólo al namespace `/sala` (como `SalaSocketProvider`)
   * reciban la difusión sin romper el aislamiento cuando las salas temáticas están en uso.
   */
  private debeEmitirFallbackGlobal(): boolean {
    const rooms = (this.server as { adapter?: { rooms?: Map<string, Set<string>> } })?.adapter
      ?.rooms;
    if (!(rooms instanceof Map)) {
      return false;
    }

    return !SALAS_TEMATICAS_PERMITIDAS.some((sala) => (rooms.get(sala)?.size ?? 0) > 0);
  }
}
