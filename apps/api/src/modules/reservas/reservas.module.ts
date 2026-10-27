import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { ReservasController } from './reservas.controller';
import { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';
import { ReservasCron } from './reservas.cron';
import { EventsModule } from '../../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [ReservasController],
  providers: [ReservasService, ReservasRepository, ReservasCron, Reloj],
  exports: [ReservasService, ReservasRepository],
})
export class ReservasModule {}
