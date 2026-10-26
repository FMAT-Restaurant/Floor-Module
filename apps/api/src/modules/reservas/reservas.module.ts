import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { ReservasController } from './reservas.controller';
import { ReservasRepository } from './reservas.repository';
import { ReservasService } from './reservas.service';

@Module({
  controllers: [ReservasController],
  providers: [ReservasService, ReservasRepository, Reloj],
  exports: [ReservasService, ReservasRepository],
})
export class ReservasModule {}
