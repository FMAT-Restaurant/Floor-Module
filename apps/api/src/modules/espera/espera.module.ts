import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { GatewaysModule } from '../../gateways/gateways.module';
import { EsperaController } from './espera.controller';
import { EsperaRepository } from './espera.repository';
import { EsperaService } from './espera.service';

/** BE-010 · subdominio de lista de espera presencial (RF-020, RF-021, RF-022). */
@Module({
  imports: [GatewaysModule],
  controllers: [EsperaController],
  providers: [EsperaService, EsperaRepository, Reloj],
  exports: [EsperaService],
})
export class EsperaModule {}
