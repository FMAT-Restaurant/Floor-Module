import { Module } from '@nestjs/common';
import { Reloj } from '../common/reloj/reloj';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';
import { RabbitMqPublisher } from './rabbitmq.publisher';

@Module({
  imports: [PrismaModule],
  providers: [OutboxService, RabbitMqPublisher, OutboxRelayService, Reloj],
  exports: [OutboxService, RabbitMqPublisher, OutboxRelayService],
})
export class EventsModule {}
