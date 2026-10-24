import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SalaWebSocketGateway } from './sala.gateway';

@Module({
  imports: [EventsModule],
  providers: [SalaWebSocketGateway],
  exports: [SalaWebSocketGateway],
})
export class GatewaysModule {}
