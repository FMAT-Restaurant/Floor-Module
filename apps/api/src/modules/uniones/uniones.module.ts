import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { EventsModule } from '../../events/events.module';
import { resolverVentanaMinutos } from '../mesas/domain/reserva-proxima';
import { VENTANA_RESERVA_PROXIMA_MINUTOS } from '../mesas/mesas.tokens';
import { UnionesController } from './uniones.controller';
import { UnionesRepository } from './uniones.repository';
import { UnionesService } from './uniones.service';

/** BE-009 · subdominio de uniones de mesas (RF-018, RF-019). */
@Module({
  imports: [EventsModule],
  controllers: [UnionesController],
  providers: [
    UnionesService,
    UnionesRepository,
    Reloj,
    {
      provide: VENTANA_RESERVA_PROXIMA_MINUTOS,
      useFactory: () => resolverVentanaMinutos(process.env.RESERVA_PROXIMA_VENTANA_MINUTOS),
    },
  ],
})
export class UnionesModule {}
