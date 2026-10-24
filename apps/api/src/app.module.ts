import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IdentityGuard } from './common/guards/identity.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor';
import { EventsModule } from './events/events.module';
import { HealthModule } from './modules/health/health.module';
import { MesasModule } from './modules/mesas/mesas.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, EventsModule, MesasModule, HealthModule],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CorrelationInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: IdentityGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
