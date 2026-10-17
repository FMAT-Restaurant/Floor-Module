import { Module } from '@nestjs/common';
import { MesasModule } from './modules/mesas/mesas.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, MesasModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
