import { Test } from '@nestjs/testing';
import { RabbitMqPublisher } from '../../events/rabbitmq.publisher';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthModule } from './health.module';

describe('HealthController & HealthModule (BE-011, SPEC §5.7, RNF-006)', () => {
  it('retorna { status: "ok", db: "up", broker: "up" } cuando PostgreSQL y RabbitMQ están activos', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as jest.Mocked<PrismaService>;
    const publisher = {
      isConnected: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<RabbitMqPublisher>;

    const controlador = new HealthController(prisma, publisher);
    const resultado = await controlador.verificar();

    expect(resultado).toEqual({
      status: 'ok',
      db: 'up',
      broker: 'up',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(publisher.isConnected).toHaveBeenCalledTimes(1);
  });

  it('reporta db: "down" y status: "degraded" si falla la consulta a PostgreSQL', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('DB connection error')),
    } as unknown as jest.Mocked<PrismaService>;
    const publisher = {
      isConnected: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<RabbitMqPublisher>;

    const controlador = new HealthController(prisma, publisher);
    const resultado = await controlador.check();

    expect(resultado).toEqual({
      status: 'degraded',
      db: 'down',
      broker: 'up',
    });
  });

  it('reporta broker: "down" y status: "degraded" si el canal AMQP de RabbitMQ está inactivo o lanza error', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as jest.Mocked<PrismaService>;
    const publisherDesconectado = {
      isConnected: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<RabbitMqPublisher>;
    const publisherConExcepcion = {
      isConnected: jest.fn().mockImplementation(() => {
        throw new Error('AMQP state error');
      }),
    } as unknown as jest.Mocked<RabbitMqPublisher>;

    const resDesconectado = await new HealthController(prisma, publisherDesconectado).check();
    const resExcepcion = await new HealthController(prisma, publisherConExcepcion).check();

    expect(resDesconectado).toEqual({
      status: 'degraded',
      db: 'up',
      broker: 'down',
    });
    expect(resExcepcion).toEqual({
      status: 'degraded',
      db: 'up',
      broker: 'down',
    });
  });

  it('compila HealthModule e inyecta HealthController con dependencias simuladas', async () => {
    const modulo = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) })
      .overrideProvider(RabbitMqPublisher)
      .useValue({ isConnected: jest.fn().mockReturnValue(true) })
      .compile();

    const controlador = modulo.get(HealthController);
    await expect(controlador.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      broker: 'up',
    });
  });
});
