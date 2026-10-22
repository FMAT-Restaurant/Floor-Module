export { EventsModule } from './events.module';
export { OutboxService } from './outbox.service';
export {
  OutboxRelayService,
  OUTBOX_RELAY_OPTIONS,
  DEFAULT_OUTBOX_BATCH_SIZE,
  DEFAULT_OUTBOX_MAX_INTENTOS,
  DEFAULT_OUTBOX_POLL_INTERVAL_MS,
  type OutboxRelayOptions,
} from './outbox-relay.service';
export {
  RabbitMqPublisher,
  RABBITMQ_PUBLISHER_OPTIONS,
  DEFAULT_RABBITMQ_URL,
  DEFAULT_RABBITMQ_EXCHANGE,
  EXCHANGE_TYPE_TOPIC,
  type RabbitMqPublisherOptions,
} from './rabbitmq.publisher';
export type {
  OutboxDomainEvent,
  OutboxEventPayloadMap,
  OutboxPublishableEvent,
  OutboxPublishedListener,
  OutboxRoutingKey,
  OutboxTransactionClient,
} from './outbox.types';
