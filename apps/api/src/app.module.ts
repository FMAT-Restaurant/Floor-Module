import { Module } from '@nestjs/common';
import { EventsModule } from './events/events.module';
import { MesasModule } from './modules/mesas/mesas.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventsModule, MesasModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
