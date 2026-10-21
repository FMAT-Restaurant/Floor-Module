import { Module } from '@nestjs/common';
import { Reloj } from '../../common/reloj/reloj';
import { resolverVentanaMinutos } from './domain/reserva-proxima';
import { MesaEstadoController } from './mesa-estado.controller';
import { MesaEstadoService } from './mesa-estado.service';
import { MesasController } from './mesas.controller';
import { MesasRepository } from './mesas.repository';
import { MesasService } from './mesas.service';
import { VENTANA_RESERVA_PROXIMA_MINUTOS } from './mesas.tokens';

@Module({
  controllers: [MesasController, MesaEstadoController],
  providers: [
    MesasService,
    MesaEstadoService,
    MesasRepository,
    Reloj,
    {
      provide: VENTANA_RESERVA_PROXIMA_MINUTOS,
      useFactory: () => resolverVentanaMinutos(process.env.RESERVA_PROXIMA_VENTANA_MINUTOS),
    },
  ],
})
export class MesasModule {}
