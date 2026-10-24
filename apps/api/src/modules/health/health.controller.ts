import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { HealthDto } from '@floor/shared';
import { Public } from '../../common/auth/auth.decorators';
import { RabbitMqPublisher } from '../../events/rabbitmq.publisher';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * BE-011 · Controlador de salud operativa (SPEC.md §5.7, ARCHITECTURE.md §9, RNF-006).
 * Expone `GET /health` excluido del prefijo global (`app.setGlobalPrefix(..., { exclude: ['health'] })`)
 * y verifica el estado de conexión de PostgreSQL (Prisma) y el canal AMQP de RabbitMQ.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMqPublisher: RabbitMqPublisher,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthDto> {
    const db = await this.verificarBaseDeDatos();
    const broker = this.verificarBrokerAmqp();
    const status = db === 'up' && broker === 'up' ? 'ok' : 'degraded';

    return {
      status,
      db,
      broker,
    };
  }

  async verificar(): Promise<HealthDto> {
    return this.check();
  }

  private async verificarBaseDeDatos(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private verificarBrokerAmqp(): 'up' | 'down' {
    try {
      return this.rabbitMqPublisher.isConnected() ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
