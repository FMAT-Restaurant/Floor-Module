import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthDto } from '@floor/shared';
import { Public } from '../../common/auth/auth.decorators';
import { RabbitMqPublisher } from '../../events/rabbitmq.publisher';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * BE-011 · Controlador de salud operativa (SPEC.md §5.7, ARCHITECTURE.md §9, RNF-006).
 * Expone `GET /health` directo y `GET /api/v1/floor/health` perimetral (INT-001)
 * verificando el estado de conexión de PostgreSQL (Prisma) y el canal AMQP de RabbitMQ.
 */
@Public()
@Controller(['health', 'api/v1/floor/health'])
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMqPublisher: RabbitMqPublisher,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) response?: Response): Promise<HealthDto> {
    const db = await this.verificarBaseDeDatos();
    const broker = this.verificarBrokerAmqp();
    const saludable = db === 'up' && broker === 'up';
    const status = saludable ? 'ok' : 'degraded';

    response?.status?.(saludable ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status,
      db,
      broker,
    };
  }

  async verificar(response?: Response): Promise<HealthDto> {
    return this.check(response);
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
