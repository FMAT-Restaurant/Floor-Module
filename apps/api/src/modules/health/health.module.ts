import { Module } from '@nestjs/common';
import { EventsModule } from '../../events/events.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [HealthController],
})
export class HealthModule {}
