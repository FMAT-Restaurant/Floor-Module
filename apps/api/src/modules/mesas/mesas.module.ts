import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { AsignacionesController } from './asignaciones.controller';
import { AsignacionesRepository } from './asignaciones.repository';
import { AsignacionesService } from './asignaciones.service';
import { resolverVentanaMinutos } from './domain/reserva-proxima';
import { MesasController } from './mesas.controller';
import { MesasRepository } from './mesas.repository';
import { MesasService } from './mesas.service';
import { VENTANA_RESERVA_PROXIMA_MINUTOS } from './mesas.tokens';

@Module({
  controllers: [MesasController, AsignacionesController],
  providers: [
    MesasService,
    MesasRepository,
    AsignacionesService,
    AsignacionesRepository,
    Reloj,
    {
      provide: VENTANA_RESERVA_PROXIMA_MINUTOS,
      useFactory: () => resolverVentanaMinutos(process.env.RESERVA_PROXIMA_VENTANA_MINUTOS),
    },
  ],
})
export class MesasModule {}
