import type { OutboxEvento, Prisma } from '@prisma/client';
import type {
  DiningSessionIniciadaPayload,
  EVENT_TOPICS,
  MesaEstadoActualizadoPayload,
  ReservaProximaAlertaPayload,
} from '@floor/shared';

/**
 * Mapa de routing keys oficiales (`EVENT_TOPICS`) a sus payloads tipados en `@floor/shared`
 * (SPEC.md §6.1, ADR-003).
 */
export interface OutboxEventPayloadMap {
  [EVENT_TOPICS.DINING_SESSION_INICIADA]: DiningSessionIniciadaPayload;
  [EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO]: MesaEstadoActualizadoPayload;
  [EVENT_TOPICS.RESERVA_PROXIMA_ALERTA]: ReservaProximaAlertaPayload;
}

export type OutboxRoutingKey = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];

/**
 * Unión discriminada de eventos de dominio encolables en `outbox_evento`.
 */
export type OutboxDomainEvent<K extends OutboxRoutingKey = OutboxRoutingKey> = {
  [T in K]: {
    routingKey: T;
    payload: OutboxEventPayloadMap[T];
    correlationId?: string | null;
  };
}[K];

/**
 * Cliente transaccional compatible tanto con `Prisma.TransactionClient` como con `PrismaService`.
 */
export type OutboxTransactionClient = Pick<Prisma.TransactionClient, 'outboxEvento'>;

/**
 * Evento persistido en `outbox_evento` listo para ser publicado en RabbitMQ.
 */
export interface OutboxPublishableEvent {
  id: string;
  routingKey: string;
  payload: Prisma.JsonValue | OutboxEventPayloadMap[OutboxRoutingKey];
  correlationId: string | null;
}

/**
 * Listener local post-publicación (punto de extensión para BE-005 SalaWebSocketGateway).
 */
export type OutboxPublishedListener = (evento: OutboxEvento) => void | Promise<void>;
