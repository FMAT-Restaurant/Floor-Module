import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { EventsModule } from '../../events/events.module';
import { ReservasController } from './reservas.controller';
import { ReservasCron } from './reservas.cron';
import { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';

@Module({
  imports: [EventsModule],
  controllers: [ReservasController],
  providers: [ReservasService, ReservasRepository, ReservasCron, Reloj],
  exports: [ReservasService, ReservasRepository],
})
export class ReservasModule {}
