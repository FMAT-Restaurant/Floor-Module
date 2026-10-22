declare module 'amqplib' {
  export interface AmqpPublishOptions {
    contentType?: string;
    contentEncoding?: string;
    headers?: Record<string, string | number | boolean | null | undefined>;
    deliveryMode?: 1 | 2;
    priority?: number;
    correlationId?: string;
    replyTo?: string;
    expiration?: string | number;
    messageId?: string;
    timestamp?: number;
    type?: string;
    userId?: string;
    appId?: string;
    mandatory?: boolean;
    persistent?: boolean;
  }

  export interface AmqpExchangeOptions {
    durable?: boolean;
    internal?: boolean;
    autoDelete?: boolean;
    alternateExchange?: string;
    arguments?: Record<string, unknown>;
  }

  export interface AmqpQueueOptions {
    exclusive?: boolean;
    durable?: boolean;
    autoDelete?: boolean;
    arguments?: Record<string, unknown>;
  }

  export interface AmqpMessageFields {
    deliveryTag: number;
    redelivered: boolean;
    exchange: string;
    routingKey: string;
    consumerTag?: string;
  }

  export interface AmqpMessageProperties {
    contentType?: string;
    contentEncoding?: string;
    headers: Record<string, unknown>;
    deliveryMode?: number;
    priority?: number;
    correlationId?: string;
    replyTo?: string;
    expiration?: string;
    messageId?: string;
    timestamp?: number;
    type?: string;
    userId?: string;
    appId?: string;
  }

  export interface AmqpConsumeMessage {
    content: Buffer;
    fields: AmqpMessageFields;
    properties: AmqpMessageProperties;
  }

  export interface AmqpChannel {
    assertExchange(
      exchange: string,
      type: 'direct' | 'topic' | 'headers' | 'fanout' | 'match' | string,
      options?: AmqpExchangeOptions,
    ): Promise<{ exchange: string }>;
    assertQueue(
      queue: string,
      options?: AmqpQueueOptions,
    ): Promise<{ queue: string; messageCount: number; consumerCount: number }>;
    bindQueue(
      queue: string,
      source: string,
      pattern: string,
      args?: Record<string, unknown>,
    ): Promise<Record<string, never>>;
    deleteQueue(
      queue: string,
      options?: { ifUnused?: boolean; ifEmpty?: boolean },
    ): Promise<{ messageCount: number }>;
    consume(
      queue: string,
      onMessage: (msg: AmqpConsumeMessage | null) => void,
      options?: { noAck?: boolean; exclusive?: boolean; consumerTag?: string },
    ): Promise<{ consumerTag: string }>;
    cancel(consumerTag: string): Promise<Record<string, never>>;
    ack(message: AmqpConsumeMessage, allUpTo?: boolean): void;
    nack(message: AmqpConsumeMessage, allUpTo?: boolean, requeue?: boolean): void;
    publish(
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: AmqpPublishOptions,
    ): boolean;
    close(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'drain', listener: () => void): this;
  }

  export interface AmqpConnection {
    createChannel(): Promise<AmqpChannel>;
    createConfirmChannel(): Promise<AmqpChannel>;
    close(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: (err?: Error) => void): this;
  }

  export function connect(
    url: string,
    socketOptions?: Record<string, unknown>,
  ): Promise<AmqpConnection>;
}
