import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import type { OutboxEvento, Prisma } from '@prisma/client';
import { EVENT_TOPICS } from '@floor/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { OutboxDomainEvent, OutboxRoutingKey, OutboxTransactionClient } from './outbox.types';

const ROUTING_KEYS_VALIDAS = new Set<string>(Object.values(EVENT_TOPICS));

function esEventoOutbox(
  candidato: OutboxTransactionClient | OutboxDomainEvent,
): candidato is OutboxDomainEvent {
  return (
    typeof candidato === 'object' &&
    candidato !== null &&
    'routingKey' in candidato &&
    'payload' in candidato
  );
}

function resolverCorrelationId(correlationId?: string | null): string {
  const limpio = correlationId?.trim();
  return limpio && limpio.length > 0 ? limpio : randomUUID();
}

function validarEvento(evento: OutboxDomainEvent): void {
  if (!ROUTING_KEYS_VALIDAS.has(evento.routingKey)) {
    throw new Error(`Routing key de Outbox inválida: ${String(evento.routingKey)}`);
  }
  if (
    typeof evento.payload !== 'object' ||
    evento.payload === null ||
    Array.isArray(evento.payload)
  ) {
    throw new Error('El payload del evento Outbox debe ser un objeto JSON válido');
  }
}

/**
 * BE-004 · Servicio de persistencia transaccional para el patrón Outbox (RF-008, RNF-005, ADR-006).
 * Registra eventos de dominio en `outbox_evento` dentro de la misma transacción SQL que modifica
 * las entidades de negocio (`Mesa`, `UnionMesa`, `Reserva`).
 */
@Injectable()
export class OutboxService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Encola un evento de dominio usando el cliente transaccional `tx` proporcionado.
   */
  enqueue<K extends OutboxRoutingKey>(
    tx: OutboxTransactionClient,
    event: OutboxDomainEvent<K>,
  ): Promise<OutboxEvento>;
  /**
   * Encola un evento de dominio usando el cliente transaccional opcional (o `PrismaService` por defecto).
   */
  enqueue<K extends OutboxRoutingKey>(
    event: OutboxDomainEvent<K>,
    tx?: OutboxTransactionClient,
  ): Promise<OutboxEvento>;
  enqueue(
    txOrEvent: OutboxTransactionClient | OutboxDomainEvent,
    maybeEventOrTx?: OutboxDomainEvent | OutboxTransactionClient,
  ): Promise<OutboxEvento> {
    const { client, event } = this.resolverArgumentos(txOrEvent, maybeEventOrTx);
    validarEvento(event);

    const correlationId = resolverCorrelationId(event.correlationId);

    return client.outboxEvento.create({
      data: {
        routingKey: event.routingKey,
        payload: event.payload as unknown as Prisma.InputJsonValue,
        correlationId,
        intentos: 0,
      },
    });
  }

  /**
   * Alias semántico de `enqueue` para compatibilidad con distintos consumidores internos.
   */
  enqueueEvent<K extends OutboxRoutingKey>(
    tx: OutboxTransactionClient,
    event: OutboxDomainEvent<K>,
  ): Promise<OutboxEvento>;
  enqueueEvent<K extends OutboxRoutingKey>(
    event: OutboxDomainEvent<K>,
    tx?: OutboxTransactionClient,
  ): Promise<OutboxEvento>;
  enqueueEvent(
    txOrEvent: OutboxTransactionClient | OutboxDomainEvent,
    maybeEventOrTx?: OutboxDomainEvent | OutboxTransactionClient,
  ): Promise<OutboxEvento> {
    if (esEventoOutbox(txOrEvent)) {
      return this.enqueue(txOrEvent, maybeEventOrTx as OutboxTransactionClient | undefined);
    }
    return this.enqueue(txOrEvent, maybeEventOrTx as OutboxDomainEvent);
  }

  private resolverArgumentos(
    txOrEvent: OutboxTransactionClient | OutboxDomainEvent,
    maybeEventOrTx?: OutboxDomainEvent | OutboxTransactionClient,
  ): { client: OutboxTransactionClient; event: OutboxDomainEvent } {
    if (esEventoOutbox(txOrEvent)) {
      const client = (maybeEventOrTx as OutboxTransactionClient | undefined) ?? this.prisma;
      if (!client) {
        throw new Error(
          'Se requiere un TransactionClient (tx) o PrismaService para encolar en outbox_evento',
        );
      }
      return { client, event: txOrEvent };
    }

    const event = maybeEventOrTx as OutboxDomainEvent | undefined;
    if (!event) {
      throw new Error('Se requiere el evento de dominio a encolar en outbox_evento');
    }
    return { client: txOrEvent, event };
  }
}
