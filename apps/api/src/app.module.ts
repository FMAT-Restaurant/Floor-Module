import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { MesasModule } from './modules/mesas/mesas.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventsModule, MesasModule, ReservasModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
